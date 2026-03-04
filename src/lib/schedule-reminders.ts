import { Resend } from 'resend';
import { DateTime } from 'luxon';
import { listUpcomingBookings, setEventExtendedProperty } from '@/lib/google-calendar';
import { buildReminderEmail } from '@/lib/booking-email';
import { buildIcsFile } from '@/lib/booking-ics';
import { createBookingManageToken } from '@/lib/booking-token';
import { extractMeetLink, extractGuestEmail, extractGuestTimezone, extractGuestName, extractAgenda } from '@/lib/calendar-utils';

/**
 * Schedules booking reminder emails via Resend `scheduledAt`.
 *
 * For each upcoming booking it computes the exact send time:
 *   - 24-hour reminder  →  eventStart − 24 h
 *   - 1-hour reminder   →  eventStart − 1 h
 *
 * A reminder is scheduled only when:
 *   1. Its send time is in the future
 *   2. Its send time is ≤ 12 hours from now (Resend limit)
 *   3. It hasn't already been scheduled (tracked via Google Calendar
 *      extended properties — this guarantees idempotency even if the
 *      function is called every few minutes).
 *
 * Safe to call on every warmup ping (every 5 min). Each reminder is
 * scheduled exactly once per event.
 */

const SCHEDULE_WINDOW_HOURS = 12; // Resend scheduledAt max lookahead

export { SCHEDULE_WINDOW_HOURS };

export async function scheduleBookingReminders(): Promise<{ processed: number; results: string[] }> {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  const resendApiKey = process.env.RESEND_API_KEY;
  const fromEmail = process.env.RESEND_FROM_EMAIL;
  const siteUrl = process.env.NEXT_PUBLIC_SITE_URL ?? process.env.SITE_URL ?? 'http://localhost:3000';
  const siteName = process.env.SITE_NAME ?? 'Manish Rawal';
  const signingSecret = process.env.BOOKING_SIGNING_SECRET;
  const adminEmail = process.env.BOOKING_ADMIN_EMAIL;

  if (!calendarId || !resendApiKey || !fromEmail || !signingSecret) {
    return { processed: 0, results: ['Not configured — skipping reminders'] };
  }

  const resend = new Resend(resendApiKey);
  const now = DateTime.now().setZone('utc');

  // Look 36 hours ahead so both 24h and 1h reminder windows are covered
  const timeMin = now.toISO()!;
  const timeMax = now.plus({ hours: 36 }).toISO()!;

  const events = await listUpcomingBookings(calendarId, timeMin, timeMax);
  const results: string[] = [];

  for (const event of events as any[]) {
    const eventId = event?.id;
    const startISO = event?.start?.dateTime;
    const endISO = event?.end?.dateTime;
    if (!eventId || !startISO || !endISO) continue;

    const eventStart = DateTime.fromISO(startISO, { zone: 'utc' });
    if (eventStart <= now) continue;

    const guestEmail = extractGuestEmail(event);
    if (!guestEmail) continue;

    const guestTz = extractGuestTimezone(event);
    const guestName = extractGuestName(event);
    const agenda = extractAgenda(event);
    const meetLink = extractMeetLink(event);

    const privateProps = event?.extendedProperties?.private ?? {};
    const reminder24hSent = privateProps['reminder_24h_sent'] === 'true';
    const reminder1hSent = privateProps['reminder_1h_sent'] === 'true';

    // Generate manage URL
    let manageUrl = '';
    try {
      const token = createBookingManageToken({ eventId, email: guestEmail });
      manageUrl = `${siteUrl.replace(/\/$/, '')}/book/manage?token=${encodeURIComponent(token)}`;
    } catch {
      // If token generation fails, skip manage URL
    }

    // --- 24-hour reminder ---
    const send24hAt = eventStart.minus({ hours: 24 });
    const hours24hFromNow = send24hAt.diff(now, 'hours').hours;

    if (!reminder24hSent && hours24hFromNow > 0 && hours24hFromNow <= SCHEDULE_WINDOW_HOURS) {
      const reminderMsg = buildReminderEmail({
        guestName, startISO, endISO, guestTimeZone: guestTz,
        meetLink, agenda, manageUrl, siteName, siteUrl,
        hoursLabel: '24 hours',
      });

      const icsContent = buildIcsFile({
        startISO, endISO, timezone: guestTz,
        summary: '15-min chat with Manish',
        description: `Agenda: ${agenda}`,
        meetLink, organizerName: siteName, organizerEmail: adminEmail ?? '',
      });

      const sendResult = await resend.emails.send({
        from: fromEmail,
        to: guestEmail,
        subject: reminderMsg.subject,
        html: reminderMsg.html,
        text: reminderMsg.text,
        scheduledAt: send24hAt.toISO()!,
        attachments: [{
          filename: 'invite.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar; method=REQUEST',
        }],
      });

      if (!sendResult.error) {
        const emailId = sendResult.data?.id ?? '';
        await setEventExtendedProperty(calendarId, eventId, 'reminder_24h_sent', 'true');
        await setEventExtendedProperty(calendarId, eventId, 'reminder_24h_email_id', emailId);
        results.push(`24h reminder scheduled for ${guestEmail} at ${send24hAt.toISO()} (event ${eventId})`);
      } else {
        results.push(`24h reminder FAILED for ${guestEmail}: ${JSON.stringify(sendResult.error)}`);
      }
    }

    // --- 1-hour reminder ---
    const send1hAt = eventStart.minus({ hours: 1 });
    const hours1hFromNow = send1hAt.diff(now, 'hours').hours;

    if (!reminder1hSent && hours1hFromNow > 0 && hours1hFromNow <= SCHEDULE_WINDOW_HOURS) {
      const reminderMsg = buildReminderEmail({
        guestName, startISO, endISO, guestTimeZone: guestTz,
        meetLink, agenda, manageUrl, siteName, siteUrl,
        hoursLabel: '1 hour',
      });

      const icsContent = buildIcsFile({
        startISO, endISO, timezone: guestTz,
        summary: '15-min chat with Manish',
        description: `Agenda: ${agenda}`,
        meetLink, organizerName: siteName, organizerEmail: adminEmail ?? '',
      });

      const sendResult = await resend.emails.send({
        from: fromEmail,
        to: guestEmail,
        subject: reminderMsg.subject,
        html: reminderMsg.html,
        text: reminderMsg.text,
        scheduledAt: send1hAt.toISO()!,
        attachments: [{
          filename: 'invite.ics',
          content: Buffer.from(icsContent, 'utf-8'),
          contentType: 'text/calendar; method=REQUEST',
        }],
      });

      if (!sendResult.error) {
        const emailId = sendResult.data?.id ?? '';
        await setEventExtendedProperty(calendarId, eventId, 'reminder_1h_sent', 'true');
        await setEventExtendedProperty(calendarId, eventId, 'reminder_1h_email_id', emailId);
        results.push(`1h reminder scheduled for ${guestEmail} at ${send1hAt.toISO()} (event ${eventId})`);
      } else {
        results.push(`1h reminder FAILED for ${guestEmail}: ${JSON.stringify(sendResult.error)}`);
      }
    }
  }

  return { processed: events.length, results };
}
