import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { buildAdminEmail, buildGuestEmail } from '@/lib/booking-email';
import { verifyBookingManageToken } from '@/lib/booking-token';
import { getCalendarEvent, isSlotBookable, updateCalendarEventTime, setEventExtendedProperty } from '@/lib/google-calendar';
import { DateTime } from 'luxon';
import { buildIcsFile } from '@/lib/booking-ics';
import { extractMeetLink, extractType, extractAgenda, extractGuestName, extractLinkedinUrl, extractCompanyName } from '@/lib/calendar-utils';

export async function POST(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.BOOKING_ADMIN_EMAIL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000';
  const siteName = process.env.SITE_NAME ?? 'Manish Rawal';

  if (!calendarId) return NextResponse.json({ error: 'Calendar not configured' }, { status: 503 });
  if (!resendApiKey || !fromEmail || !adminEmail) return NextResponse.json({ error: 'Email not configured' }, { status: 503 });

  let body: { token: string; start: string; end: string; clientTimeZone: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }

  let verified: ReturnType<typeof verifyBookingManageToken>;
  try {
    verified = verifyBookingManageToken(body.token ?? '');
  } catch (e) {
    console.error('Token verify error:', e);
    return NextResponse.json({ error: 'Booking links not configured' }, { status: 503 });
  }
  if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 401 });

  const clientTimeZone = body.clientTimeZone?.trim() || 'UTC';

  const event = await getCalendarEvent(calendarId, verified.payload.eventId);
  const existingStart = event?.start?.dateTime;
  if (!existingStart) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  // Enforce 12-hour notice for changes as well.
  const ownerTz = process.env.GOOGLE_CALENDAR_TIMEZONE ?? 'America/New_York';
  const nowOwner = DateTime.now().setZone(ownerTz);
  const startOwner = DateTime.fromISO(existingStart, { zone: ownerTz });
  if (startOwner.diff(nowOwner, 'hours').hours < 12) {
    return NextResponse.json({ error: 'Changes are disabled within 12 hours of the meeting.' }, { status: 400 });
  }

  const type = extractType(event);
  if (!type) return NextResponse.json({ error: 'Could not determine booking type' }, { status: 400 });

  const check = await isSlotBookable({
    calendarId,
    type,
    startISO: body.start,
    endISO: body.end,
    ignoreEventId: verified.payload.eventId,
  });
  if (!check.ok) return NextResponse.json({ error: check.reason }, { status: 400 });

  // Cancel any previously scheduled reminder emails
  const resend = new Resend(resendApiKey);
  const privateProps = (event as any)?.extendedProperties?.private ?? {};
  for (const key of ['reminder_24h_email_id', 'reminder_1h_email_id'] as const) {
    const emailId = privateProps[key];
    if (emailId) {
      try { await resend.emails.cancel(emailId); } catch { /* already sent or invalid — ignore */ }
    }
  }

  const updated = await updateCalendarEventTime(calendarId, verified.payload.eventId, { start: body.start, end: body.end });

  // Reset reminder flags so the cron re-schedules for the new time
  await setEventExtendedProperty(calendarId, verified.payload.eventId, 'reminder_24h_sent', '');
  await setEventExtendedProperty(calendarId, verified.payload.eventId, 'reminder_1h_sent', '');
  await setEventExtendedProperty(calendarId, verified.payload.eventId, 'reminder_24h_email_id', '');
  await setEventExtendedProperty(calendarId, verified.payload.eventId, 'reminder_1h_email_id', '');
  const meetLink = extractMeetLink(updated);
  const eventId = typeof updated?.id === 'string' ? updated.id : null;
  const calendarEventLink = typeof updated?.htmlLink === 'string' ? updated.htmlLink : null;

  const manageUrl = `${siteUrl.replace(/\/$/, '')}/book/manage?token=${encodeURIComponent(body.token)}`;

  const guestName = extractGuestName(updated);
  const agenda = extractAgenda(updated);
  const typeLabel = type === 'job-seeker' ? 'Job Seeker' : 'Peer Networking';
  const linkedinUrl = extractLinkedinUrl(updated);
  const companyName = type === 'networking' ? extractCompanyName(updated) : undefined;

  const guestMsg = buildGuestEmail({
    guestName,
    startISO: body.start,
    endISO: body.end,
    guestTimeZone: clientTimeZone,
    meetLink,
    agenda,
    manageUrl,
    siteName,
    siteUrl,
    typeLabel,
    linkedinUrl,
    companyName,
  });

  const adminMsg = buildAdminEmail({
    guestName,
    guestEmail: verified.payload.email,
    guestTimeZone: clientTimeZone,
    startISO: body.start,
    endISO: body.end,
    agenda,
    typeLabel,
    meetLink,
    calendarEventLink,
    eventId,
    linkedinUrl,
    companyName,
  });

  // Build .ics in guest's timezone
  const icsContent = buildIcsFile({
    startISO: body.start,
    endISO: body.end,
    timezone: clientTimeZone,
    summary: `15-min chat with Manish`,
    description: `Agenda: ${agenda}`,
    meetLink,
    organizerName: siteName,
    organizerEmail: adminEmail,
  });
  const icsAttachment = {
    filename: 'invite.ics',
    content: Buffer.from(icsContent, 'utf-8'),
    contentType: 'text/calendar; method=REQUEST',
  };

  const guestSend = await resend.emails.send({
    from: fromEmail,
    to: verified.payload.email,
    subject: `Updated: ${guestMsg.subject}`,
    html: guestMsg.html,
    text: guestMsg.text,
    attachments: [icsAttachment],
  });
  if (guestSend.error) return NextResponse.json({ error: 'Failed to send updated email' }, { status: 500 });

  // Admin ICS in owner timezone
  const adminIcsContent = buildIcsFile({
    startISO: body.start,
    endISO: body.end,
    timezone: ownerTz,
    summary: `15-min chat: ${guestName} (${typeLabel})`,
    description: `${typeLabel}\n${guestName} <${verified.payload.email}>\nAgenda: ${agenda}`,
    meetLink,
    organizerName: siteName,
    organizerEmail: adminEmail,
  });
  const adminIcsAttachment = {
    filename: 'invite.ics',
    content: Buffer.from(adminIcsContent, 'utf-8'),
    contentType: 'text/calendar; method=REQUEST',
  };

  const adminSend = await resend.emails.send({
    from: fromEmail,
    to: adminEmail,
    subject: `Updated: ${adminMsg.subject}`,
    html: adminMsg.html,
    text: adminMsg.text,
    attachments: [adminIcsAttachment],
  });
  if (adminSend.error) return NextResponse.json({ error: 'Failed to send admin update email' }, { status: 500 });

  return NextResponse.json({ success: true, start: body.start, end: body.end, meetLink, manageUrl });
}

