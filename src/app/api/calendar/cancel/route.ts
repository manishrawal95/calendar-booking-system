import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { verifyBookingManageToken } from '@/lib/booking-token';
import { deleteCalendarEvent, getCalendarEvent } from '@/lib/google-calendar';
import { DateTime } from 'luxon';
import { extractMeetLink, extractGuestName } from '@/lib/calendar-utils';
import { buildCancellationEmail, buildAdminCancellationEmail } from '@/lib/booking-email';

export async function POST(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.BOOKING_ADMIN_EMAIL;

  if (!calendarId) return NextResponse.json({ error: 'Calendar not configured' }, { status: 503 });
  if (!resendApiKey || !fromEmail || !adminEmail) return NextResponse.json({ error: 'Email not configured' }, { status: 503 });

  let body: { token: string; clientTimeZone: string };
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

  const event = await getCalendarEvent(calendarId, verified.payload.eventId);
  const startISO = event?.start?.dateTime;
  const endISO = event?.end?.dateTime;
  if (!startISO || !endISO) return NextResponse.json({ error: 'Event not found' }, { status: 404 });

  const ownerTz = process.env.GOOGLE_CALENDAR_TIMEZONE ?? 'America/New_York';
  const nowOwner = DateTime.now().setZone(ownerTz);
  const startOwner = DateTime.fromISO(startISO, { zone: ownerTz });
  if (startOwner.diff(nowOwner, 'hours').hours < 12) {
    return NextResponse.json({ error: 'Cancellations are disabled within 12 hours of the meeting.' }, { status: 400 });
  }

  // Cancel any previously scheduled reminder emails before deleting the event
  const privateProps = (event as any)?.extendedProperties?.private ?? {};
  const resend = new Resend(resendApiKey);
  for (const key of ['reminder_24h_email_id', 'reminder_1h_email_id'] as const) {
    const emailId = privateProps[key];
    if (emailId) {
      try { await resend.emails.cancel(emailId); } catch { /* already sent or invalid — ignore */ }
    }
  }

  await deleteCalendarEvent(calendarId, verified.payload.eventId);

  const guestTz = body.clientTimeZone?.trim() || 'UTC';
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000';
  const siteName = process.env.SITE_NAME ?? 'Manish Rawal';
  const guestName = extractGuestName(event);

  const guestMsg = buildCancellationEmail({
    guestName,
    startISO,
    endISO,
    guestTimeZone: guestTz,
    siteName,
    siteUrl,
  });

  const guestSend = await resend.emails.send({
    from: fromEmail,
    to: verified.payload.email,
    subject: guestMsg.subject,
    html: guestMsg.html,
    text: guestMsg.text,
  });
  if (guestSend.error) return NextResponse.json({ error: 'Cancelled, but failed to send guest email' }, { status: 500 });

  const adminMsg = buildAdminCancellationEmail({
    guestEmail: verified.payload.email,
    startISO,
    endISO,
  });

  const adminSend = await resend.emails.send({
    from: fromEmail,
    to: adminEmail,
    subject: adminMsg.subject,
    html: adminMsg.html,
    text: adminMsg.text,
  });
  if (adminSend.error) return NextResponse.json({ error: 'Cancelled, but failed to send admin email' }, { status: 500 });

  return NextResponse.json({ success: true });
}

