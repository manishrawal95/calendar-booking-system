import { NextRequest, NextResponse } from 'next/server';
import { Resend } from 'resend';
import { DateTime } from 'luxon';
import { createCalendarEvent, deleteCalendarEvent, isSlotBookable, setEventExtendedProperty } from '@/lib/google-calendar';
import type { BookingType } from '@/lib/google-calendar';
import { buildAdminEmail, buildGuestEmail, buildReminderEmail } from '@/lib/booking-email';
import { createBookingManageToken } from '@/lib/booking-token';
import { buildIcsFile } from '@/lib/booking-ics';
import { SCHEDULE_WINDOW_HOURS } from '@/lib/schedule-reminders';
import { extractMeetLink } from '@/lib/calendar-utils';
import { isValidEmail } from '@/lib/validation';

const VALID_TYPES: BookingType[] = ['job-seeker', 'networking'];

export async function POST(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const adminEmail = process.env.BOOKING_ADMIN_EMAIL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000';
  const siteName = process.env.SITE_NAME ?? 'Manish Rawal';
  const signingSecret = process.env.BOOKING_SIGNING_SECRET;

  if (!calendarId) {
    return NextResponse.json({ error: 'Calendar not configured' }, { status: 503 });
  }
  if (!resendApiKey || !fromEmail) {
    return NextResponse.json({ error: 'Email not configured (RESEND_API_KEY, RESEND_FROM_EMAIL)' }, { status: 503 });
  }
  if (!adminEmail) {
    return NextResponse.json({ error: 'Email not configured (BOOKING_ADMIN_EMAIL)' }, { status: 503 });
  }
  if (!signingSecret) {
    return NextResponse.json({ error: 'Booking links not configured (BOOKING_SIGNING_SECRET)' }, { status: 503 });
  }

  let body: { type: BookingType; start: string; end: string; name: string; email: string; agenda: string; clientTimeZone: string; networkingGuardrailOk?: boolean; linkedinUrl?: string; companyName?: string };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 });
  }
  const { type, start, end, name, email, agenda, clientTimeZone, networkingGuardrailOk, linkedinUrl, companyName } = body;
  if (!VALID_TYPES.includes(type) || !start || !end || !name?.trim() || !email?.trim() || !agenda?.trim() || !clientTimeZone?.trim()) {
    return NextResponse.json({ error: 'Missing or invalid type, start, end, name, email, agenda, or timezone' }, { status: 400 });
  }
  if (!linkedinUrl?.trim()) {
    return NextResponse.json({ error: 'LinkedIn URL is required' }, { status: 400 });
  }
  if (type === 'networking' && !companyName?.trim()) {
    return NextResponse.json({ error: 'Company name is required for peer networking' }, { status: 400 });
  }
  if (type === 'networking' && networkingGuardrailOk !== true) {
    return NextResponse.json({ error: 'Please confirm the networking guardrail.' }, { status: 400 });
  }
  const emailCheck = isValidEmail(email, type);
  if (!emailCheck.valid) {
    return NextResponse.json({ error: emailCheck.reason ?? 'Invalid email' }, { status: 400 });
  }
  const trimmedAgenda = agenda.trim().slice(0, 500);

  const typeLabel = type === 'job-seeker' ? 'Job Seeker' : 'Peer Networking';
  const summary = `15-min chat: ${name} (${typeLabel})`;
  const descParts = [
    `Booking type: ${typeLabel}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `LinkedIn: ${linkedinUrl!.trim()}`,
  ];
  if (type === 'networking' && companyName?.trim()) {
    descParts.push(`Company: ${companyName.trim()}`);
  }
  descParts.push(`Guest timezone: ${clientTimeZone}`, `Agenda: ${trimmedAgenda}`);
  const description = descParts.join('\n');

  const ok = await isSlotBookable({ calendarId, type, startISO: start, endISO: end });
  if (!ok.ok) {
    return NextResponse.json({ error: ok.reason }, { status: 400 });
  }

  let event: any;
  try {
    event = await createCalendarEvent(calendarId, { start, end, summary, description });
  } catch (e) {
    console.error('Book error:', e);
    return NextResponse.json({ error: 'Failed to create booking' }, { status: 500 });
  }

  const resend = new Resend(resendApiKey);
  const meetLink = extractMeetLink(event);
  const eventId = typeof event?.id === 'string' ? event.id : null;
  const calendarEventLink = typeof event?.htmlLink === 'string' ? event.htmlLink : null;

  let manageUrl = '';
  if (eventId) {
    const token = createBookingManageToken({ eventId, email });
    manageUrl = `${siteUrl.replace(/\/$/, '')}/book/manage?token=${encodeURIComponent(token)}`;
  }

  const guestEmail = buildGuestEmail({
    guestName: name.trim(),
    startISO: start,
    endISO: end,
    guestTimeZone: clientTimeZone.trim(),
    meetLink,
    agenda: trimmedAgenda,
    manageUrl,
    siteName,
    siteUrl,
    typeLabel,
    linkedinUrl: linkedinUrl?.trim(),
    companyName: type === 'networking' ? companyName?.trim() : undefined,
  });

  const adminMsg = buildAdminEmail({
    guestName: name.trim(),
    guestEmail: email.trim(),
    guestTimeZone: clientTimeZone.trim(),
    startISO: start,
    endISO: end,
    agenda: trimmedAgenda,
    typeLabel,
    meetLink,
    calendarEventLink,
    eventId,
    linkedinUrl: linkedinUrl?.trim(),
    companyName: type === 'networking' ? companyName?.trim() : undefined,
  });

  // Build .ics attachment in the guest's timezone so their calendar app shows the correct local time
  const icsContent = buildIcsFile({
    startISO: start,
    endISO: end,
    timezone: clientTimeZone.trim(),
    summary: `15-min chat with Manish`,
    description: `Agenda: ${trimmedAgenda}`,
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
    to: email,
    subject: guestEmail.subject,
    html: guestEmail.html,
    text: guestEmail.text,
    attachments: [icsAttachment],
  });

  if (guestSend.error) {
    console.error('Guest email error:', guestSend.error);
    if (eventId) await deleteCalendarEvent(calendarId, eventId);
    return NextResponse.json({ error: 'Failed to send confirmation email' }, { status: 500 });
  }

  // Admin gets the ICS in the owner's timezone
  const ownerTz = process.env.GOOGLE_CALENDAR_TIMEZONE ?? 'America/New_York';
  const adminIcsContent = buildIcsFile({
    startISO: start,
    endISO: end,
    timezone: ownerTz,
    summary: `15-min chat: ${name.trim()} (${typeLabel})`,
    description: `${typeLabel}\n${name.trim()} <${email.trim()}>\nAgenda: ${trimmedAgenda}`,
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
    subject: adminMsg.subject,
    html: adminMsg.html,
    text: adminMsg.text,
    attachments: [adminIcsAttachment],
  });

  if (adminSend.error) {
    console.error('Admin email error:', adminSend.error);
    if (eventId) await deleteCalendarEvent(calendarId, eventId);
    return NextResponse.json({ error: 'Failed to send admin confirmation email' }, { status: 500 });
  }

  // Schedule reminder emails via Resend scheduledAt (non-blocking — cron is the backstop)
  if (eventId) {
    try {
      const now = DateTime.now().setZone('utc');
      const eventStart = DateTime.fromISO(start, { zone: 'utc' });

      // 24h reminder: schedulable when booking is 24–36 h away
      const send24hAt = eventStart.minus({ hours: 24 });
      const hours24hFromNow = send24hAt.diff(now, 'hours').hours;
      if (hours24hFromNow > 0 && hours24hFromNow <= SCHEDULE_WINDOW_HOURS) {
        const reminderMsg = buildReminderEmail({
          guestName: name.trim(),
          startISO: start,
          endISO: end,
          guestTimeZone: clientTimeZone.trim(),
          meetLink,
          agenda: trimmedAgenda,
          manageUrl,
          siteName,
          siteUrl,
          hoursLabel: '24 hours',
        });
        const icsRem = buildIcsFile({
          startISO: start, endISO: end, timezone: clientTimeZone.trim(),
          summary: '15-min chat with Manish', description: `Agenda: ${trimmedAgenda}`,
          meetLink, organizerName: siteName, organizerEmail: adminEmail,
        });
        const r24 = await resend.emails.send({
          from: fromEmail, to: email, subject: reminderMsg.subject,
          html: reminderMsg.html, text: reminderMsg.text,
          scheduledAt: send24hAt.toISO()!,
          attachments: [{ filename: 'invite.ics', content: Buffer.from(icsRem, 'utf-8'), contentType: 'text/calendar; method=REQUEST' }],
        });
        if (!r24.error) {
          await setEventExtendedProperty(calendarId, eventId, 'reminder_24h_sent', 'true');
          await setEventExtendedProperty(calendarId, eventId, 'reminder_24h_email_id', r24.data?.id ?? '');
        }
      }

      // 1h reminder: schedulable when booking is 1–13 h away
      const send1hAt = eventStart.minus({ hours: 1 });
      const hours1hFromNow = send1hAt.diff(now, 'hours').hours;
      if (hours1hFromNow > 0 && hours1hFromNow <= SCHEDULE_WINDOW_HOURS) {
        const reminderMsg = buildReminderEmail({
          guestName: name.trim(),
          startISO: start,
          endISO: end,
          guestTimeZone: clientTimeZone.trim(),
          meetLink,
          agenda: trimmedAgenda,
          manageUrl,
          siteName,
          siteUrl,
          hoursLabel: '1 hour',
        });
        const icsRem = buildIcsFile({
          startISO: start, endISO: end, timezone: clientTimeZone.trim(),
          summary: '15-min chat with Manish', description: `Agenda: ${trimmedAgenda}`,
          meetLink, organizerName: siteName, organizerEmail: adminEmail,
        });
        const r1 = await resend.emails.send({
          from: fromEmail, to: email, subject: reminderMsg.subject,
          html: reminderMsg.html, text: reminderMsg.text,
          scheduledAt: send1hAt.toISO()!,
          attachments: [{ filename: 'invite.ics', content: Buffer.from(icsRem, 'utf-8'), contentType: 'text/calendar; method=REQUEST' }],
        });
        if (!r1.error) {
          await setEventExtendedProperty(calendarId, eventId, 'reminder_1h_sent', 'true');
          await setEventExtendedProperty(calendarId, eventId, 'reminder_1h_email_id', r1.data?.id ?? '');
        }
      }
    } catch (e) {
      console.error('Reminder scheduling error (non-fatal):', e);
    }
  }

  return NextResponse.json({ success: true, eventId, htmlLink: calendarEventLink, meetLink, manageUrl });
}
