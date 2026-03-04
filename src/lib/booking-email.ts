const DEFAULT_OWNER_TZ = 'America/New_York';

function fmtRange(startISO: string, endISO: string, tz: string) {
  const start = new Date(startISO);
  const end = new Date(endISO);
  const dateOpts: Intl.DateTimeFormatOptions = {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  };
  const startStr = start.toLocaleString('en-US', dateOpts);
  const endStr = end.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true, timeZone: tz });
  return `${startStr} – ${endStr}`;
}

function fmtSubjectDateTime(startISO: string, tz: string) {
  const start = new Date(startISO);
  return start.toLocaleString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
    timeZone: tz,
  });
}

function escapeHtml(s: string) {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\"/g, '&quot;');
}

function toSentenceCase(name: string) {
  if (!name) return '';
  return name
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
}

const DARK_MODE_STYLES = `<style>
  @media (prefers-color-scheme: dark) {
    body, .email-wrapper { background: #1a1a1a !important; }
    .card          { background: #2a2a2a !important; border-color: #3a3a3a !important; box-shadow: none !important; }
    .card-inner    { background: #222222 !important; border-color: #3a3a3a !important; }
    .text-primary  { color: #f3f4f6 !important; }
    .text-secondary{ color: #d1d5db !important; }
    .text-muted    { color: #9ca3af !important; }
    .footer-border { border-top-color: #2a2a2a !important; }
    .btn-join      { background: #1a6fff !important; }
  }
</style>`;

export function buildGuestEmail(params: {
  guestName: string;
  startISO: string;
  endISO: string;
  guestTimeZone: string;
  meetLink: string | null;
  agenda: string;
  manageUrl: string;
  siteName: string;
  siteUrl: string;
  typeLabel?: string;
  linkedinUrl?: string;
  companyName?: string;
}) {
  const when = fmtRange(params.startISO, params.endISO, params.guestTimeZone);
  const meet = params.meetLink ?? params.siteUrl;
  const subjectWhen = fmtSubjectDateTime(params.startISO, params.guestTimeZone);
  const subject = `🎉 15-min chat confirmed with Manish – ${subjectWhen}`;

  const preheader = `Your 15-min chat with Manish is confirmed for ${when}`;

  const html = `<!doctype html>
<html lang="en" style="color-scheme: light dark;">
<head>
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  ${DARK_MODE_STYLES}
</head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:#ffffff;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">

            <!-- Fun confetti accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#ff6b6b,#ffd93d,#6bcb77,#4d96ff,#c77dff);"></td>
            </tr>

            <tr>
              <td style="padding:18px 24px;background:#ffffff;border-bottom:1px solid #f3f4f6;">
                <div class="text-primary" style="font-weight:800;font-size:14px;color:#111827;letter-spacing:0.2px;">Booking Confirmed</div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;background:#ffffff;">
                <div style="font-size:14px;line-height:1.7;color:#111827;margin:0 0 12px;">
                  <div class="text-primary" style="font-weight:800;color:#111827;">Hi ${escapeHtml(toSentenceCase(params.guestName))},</div>
                  <div class="text-secondary" style="margin-top:8px;color:#374151;">
                    Your 15‑minute chat is all set!
                  </div>
                </div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card-inner" style="border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">When</div>
                      <div class="text-primary" style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${escapeHtml(when)}</div>
                      <div class="text-muted" style="font-size:11px;color:#6b7280;margin-top:4px;">Timezone: ${escapeHtml(params.guestTimeZone)}</div>
                    </td>
                  </tr>
                  ${params.typeLabel ? `<tr>
                    <td style="padding:0 16px 14px;border-top:1px solid #e5e7eb;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;padding-top:14px;">Booking type</div>
                      <div class="text-primary" style="font-size:14px;font-weight:600;color:#111827;margin-top:4px;">${escapeHtml(params.typeLabel)}${params.companyName ? ` · ${escapeHtml(params.companyName)}` : ''}</div>
                    </td>
                  </tr>` : ''}
                  <tr>
                    <td style="padding:0 16px 14px;border-top:1px solid #e5e7eb;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;padding-top:14px;">Agenda</div>
                      <div class="text-primary" style="font-size:14px;font-weight:600;color:#111827;margin-top:4px;">${escapeHtml(params.agenda)}</div>
                    </td>
                  </tr>
                  ${params.linkedinUrl ? `<tr>
                    <td style="padding:0 16px 14px;border-top:1px solid #e5e7eb;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;padding-top:14px;">Your LinkedIn</div>
                      <div style="margin-top:4px;"><a href="${escapeHtml(params.linkedinUrl)}" style="color:#0066ff;text-decoration:none;font-size:13px;font-weight:600;">View profile &rarr;</a></div>
                    </td>
                  </tr>` : ''}
                </table>

                <div style="height:20px;"></div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="btn-join" style="background:#0066ff;border-radius:999px;">
                            <a href="${escapeHtml(meet)}" style="display:inline-block;padding:10px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;">
                              Join call
                            </a>
                          </td>
                        </tr>
                      </table>
                      <div class="text-muted" style="margin-top:8px;font-size:11px;color:#9ca3af;">
                        Button not working? <a href="${escapeHtml(meet)}" style="color:#9ca3af;text-decoration:underline;">Click here to join</a>
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="height:16px;"></div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="border:1px solid #e5e7eb;border-radius:999px;">
                            <a href="${escapeHtml(params.manageUrl)}" style="display:inline-block;padding:10px 24px;color:#374151;text-decoration:none;font-weight:600;font-size:13px;">
                              Reschedule or Cancel
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <div style="height:24px;"></div>
                <div class="text-secondary" style="font-size:14px;line-height:1.7;color:#374151;">
                  Looking forward to our call!<br/>
                  — <span style="color:#111827;">Manish</span>
                </div>
              </td>
            </tr>

            <tr>
              <td class="footer-border" style="padding:16px 24px;background:#ffffff;border-top:1px solid #f3f4f6;">
                <a href="${escapeHtml(params.siteUrl)}" style="color:#4b5563;text-decoration:none;font-weight:600;font-size:13px;">
                  View Portfolio &#8599;
                </a>
                <div class="text-muted" style="margin-top:8px;font-size:11px;color:#9ca3af;">
                  This is an automated message — please do not reply.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${params.guestName},

Your 15‑minute chat is confirmed.

When: ${when}
Timezone: ${params.guestTimeZone}
${params.typeLabel ? `Booking type: ${params.typeLabel}${params.companyName ? ` · ${params.companyName}` : ''}\n` : ''}Agenda: ${params.agenda}
${params.linkedinUrl ? `Your LinkedIn: ${params.linkedinUrl}\n` : ''}${params.meetLink ? `Join: ${params.meetLink}\n` : ''}Manage booking: ${params.manageUrl}

— Manish
${params.siteUrl}`;

  return { subject, html, text };
}

/**
 * Build a reminder email for the guest.
 * Re-uses the same visual template as the confirmation email.
 * @param hoursLabel - e.g. "24 hours" or "1 hour"
 */
export function buildReminderEmail(params: {
  guestName: string;
  startISO: string;
  endISO: string;
  guestTimeZone: string;
  meetLink: string | null;
  agenda: string;
  manageUrl: string;
  siteName: string;
  siteUrl: string;
  hoursLabel: string;
}) {
  const when = fmtRange(params.startISO, params.endISO, params.guestTimeZone);
  const meet = params.meetLink ?? params.siteUrl;
  const subjectWhen = fmtSubjectDateTime(params.startISO, params.guestTimeZone);
  const isUrgent = params.hoursLabel === '1 hour';
  const subject = isUrgent
    ? `Starting soon! Your chat with Manish is in ${params.hoursLabel} – ${subjectWhen}`
    : `Reminder: 15-min chat with Manish in ${params.hoursLabel} – ${subjectWhen}`;

  const preheader = isUrgent
    ? `Your chat with Manish starts in ${params.hoursLabel}!`
    : `Reminder: your chat with Manish is in ${params.hoursLabel}`;
  const bodyText = isUrgent
    ? `Your 15‑minute chat starts in ${params.hoursLabel} — get ready!`
    : `Just a heads up — your 15‑minute chat is in ${params.hoursLabel}.`;

  const html = `<!doctype html>
<html lang="en" style="color-scheme: light dark;">
<head>
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  ${DARK_MODE_STYLES}
</head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:#ffffff;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">

            <!-- Accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#4d96ff,#6bcb77,#ffd93d,#ff6b6b,#c77dff);"></td>
            </tr>

            <tr>
              <td style="padding:18px 24px;background:#ffffff;border-bottom:1px solid #f3f4f6;">
                <div class="text-primary" style="font-weight:800;font-size:14px;color:#111827;letter-spacing:0.2px;">${isUrgent ? 'Starting soon!' : 'Reminder'}: Your chat is in ${escapeHtml(params.hoursLabel)}</div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;background:#ffffff;">
                <div style="font-size:14px;line-height:1.7;color:#111827;margin:0 0 12px;">
                  <div class="text-primary" style="font-weight:800;color:#111827;">Hi ${escapeHtml(toSentenceCase(params.guestName))},</div>
                  <div class="text-secondary" style="margin-top:8px;color:#374151;">
                    ${bodyText}
                  </div>
                </div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card-inner" style="border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">When</div>
                      <div class="text-primary" style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${escapeHtml(when)}</div>
                      <div class="text-muted" style="font-size:11px;color:#6b7280;margin-top:4px;">Timezone: ${escapeHtml(params.guestTimeZone)}</div>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding:0 16px 14px;border-top:1px solid #e5e7eb;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;padding-top:14px;">Agenda</div>
                      <div class="text-primary" style="font-size:14px;font-weight:600;color:#111827;margin-top:4px;">${escapeHtml(params.agenda)}</div>
                    </td>
                  </tr>
                </table>

                <div style="height:20px;"></div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="btn-join" style="background:#0066ff;border-radius:999px;">
                            <a href="${escapeHtml(meet)}" style="display:inline-block;padding:10px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;">
                              Join call
                            </a>
                          </td>
                        </tr>
                      </table>
                      <div class="text-muted" style="margin-top:8px;font-size:11px;color:#9ca3af;">
                        Button not working? <a href="${escapeHtml(meet)}" style="color:#9ca3af;text-decoration:underline;">Click here to join</a>
                      </div>
                    </td>
                  </tr>
                </table>

                <div style="height:16px;"></div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td style="border:1px solid #e5e7eb;border-radius:999px;">
                            <a href="${escapeHtml(params.manageUrl)}" style="display:inline-block;padding:10px 24px;color:#374151;text-decoration:none;font-weight:600;font-size:13px;">
                              Reschedule or Csancel
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <div style="height:24px;"></div>
                <div class="text-secondary" style="font-size:14px;line-height:1.7;color:#374151;">
                  See you soon!<br/>
                  — <span style="color:#111827;">Manish</span>
                </div>
              </td>
            </tr>

            <tr>
              <td class="footer-border" style="padding:16px 24px;background:#ffffff;border-top:1px solid #f3f4f6;">
                <a href="${escapeHtml(params.siteUrl)}" style="color:#4b5563;text-decoration:none;font-weight:600;font-size:13px;">
                  View Portfolio &#8599;
                </a>
                <div class="text-muted" style="margin-top:8px;font-size:11px;color:#9ca3af;">
                  This is an automated message — please do not reply.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${params.guestName},

Reminder: your 15‑minute chat is in ${params.hoursLabel}.

When: ${when}
Timezone: ${params.guestTimeZone}
Agenda: ${params.agenda}
${params.meetLink ? `Join: ${params.meetLink}\n` : ''}Manage booking: ${params.manageUrl}

— Manish
${params.siteUrl}`;

  return { subject, html, text };
}

export function buildAdminEmail(params: {
  guestName: string;
  guestEmail: string;
  guestTimeZone: string;
  startISO: string;
  endISO: string;
  agenda: string;
  typeLabel: string;
  meetLink: string | null;
  calendarEventLink: string | null;
  eventId: string | null;
  linkedinUrl?: string;
  companyName?: string;
}) {
  const ownerTz = process.env.GOOGLE_CALENDAR_TIMEZONE ?? DEFAULT_OWNER_TZ;
  const whenOwner = fmtRange(params.startISO, params.endISO, ownerTz);
  const subject = `New booking — ${whenOwner.split(',')[0]}`;

  const html = `<!doctype html>
<html lang="en" style="color-scheme: light dark;">
<head>
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  <style>
    @media (prefers-color-scheme: dark) {
      body, .email-wrapper { background: #1a1a1a !important; }
      .card          { background: #2a2a2a !important; border-color: #3a3a3a !important; box-shadow: none !important; }
      .card-inner    { background: #222222 !important; border-color: #3a3a3a !important; }
      .text-primary  { color: #f3f4f6 !important; }
      .text-secondary{ color: #d1d5db !important; }
      .text-muted    { color: #9ca3af !important; }
      .footer-border { border-top-color: #2a2a2a !important; }
      .btn-join      { background: #1a6fff !important; }
    }
  </style>
</head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:16px 20px;background:#111827;color:#ffffff;">
                <div style="font-weight:800;">New booking</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">${escapeHtml(whenOwner)} (NYC time)</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;background:#ffffff;">
                <div style="font-size:14px;line-height:1.7;color:#111827;">
                  <div><strong>Guest:</strong> ${escapeHtml(params.guestName)} &lt;<a href="mailto:${escapeHtml(params.guestEmail)}" style="color:#0066ff;text-decoration:none;">${escapeHtml(params.guestEmail)}</a>&gt;</div>
                  ${params.linkedinUrl ? `<div><strong>LinkedIn:</strong> <a href="${escapeHtml(params.linkedinUrl)}" style="color:#0066ff;text-decoration:none;">${escapeHtml(params.linkedinUrl)}</a></div>` : ''}
                  ${params.companyName ? `<div><strong>Company:</strong> ${escapeHtml(params.companyName)}</div>` : ''}
                  <div><strong>Guest timezone:</strong> ${escapeHtml(params.guestTimeZone)}</div>
                  <div><strong>Type:</strong> ${escapeHtml(params.typeLabel)}</div>
                  <div style="margin-top:10px;"><strong>Agenda:</strong><br/>${escapeHtml(params.agenda)}</div>
                  ${params.meetLink ? `<div style="margin-top:10px;"><strong>Meet:</strong> <a href="${escapeHtml(params.meetLink)}" style="color:#0066ff;text-decoration:none;">${escapeHtml(params.meetLink)}</a></div>` : ''}
                  ${params.calendarEventLink ? `<div style="margin-top:6px;"><strong>Calendar:</strong> <a href="${escapeHtml(params.calendarEventLink)}" style="color:#0066ff;text-decoration:none;">Open event</a></div>` : ''}
                  ${params.eventId ? `<div style="margin-top:6px;"><strong>Event ID:</strong> ${escapeHtml(params.eventId)}</div>` : ''}
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `New booking (NYC time)

When: ${whenOwner}
Guest: ${params.guestName} <${params.guestEmail}>
${params.linkedinUrl ? `LinkedIn: ${params.linkedinUrl}\n` : ''}${params.companyName ? `Company: ${params.companyName}\n` : ''}Guest timezone: ${params.guestTimeZone}
Type: ${params.typeLabel}
Agenda: ${params.agenda}
${params.meetLink ? `Meet: ${params.meetLink}\n` : ''}${params.calendarEventLink ? `Calendar: ${params.calendarEventLink}\n` : ''}${params.eventId ? `Event ID: ${params.eventId}\n` : ''}`;

  return { subject, html, text };
}

export function buildCancellationEmail(params: {
  guestName: string;
  startISO: string;
  endISO: string;
  guestTimeZone: string;
  siteName: string;
  siteUrl: string;
}) {
  const when = fmtRange(params.startISO, params.endISO, params.guestTimeZone);
  const subjectWhen = fmtSubjectDateTime(params.startISO, params.guestTimeZone);
  const subject = `Cancelled: 15-min chat with Manish – ${subjectWhen.split(',')[0]}`;

  const preheader = `Your 15-min chat with Manish has been cancelled`;

  const html = `<!doctype html>
<html lang="en" style="color-scheme: light dark;">
<head>
  <meta name="color-scheme" content="light dark" />
  <meta name="supported-color-schemes" content="light dark" />
  ${DARK_MODE_STYLES}
</head>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <div style="display:none;max-height:0;overflow:hidden;">${escapeHtml(preheader)}</div>
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="email-wrapper" style="background:#ffffff;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" class="card" style="width:600px;max-width:600px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;box-shadow:0 10px 25px rgba(0,0,0,0.06);">

            <!-- Accent bar -->
            <tr>
              <td style="height:6px;background:linear-gradient(90deg,#9ca3af,#d1d5db,#9ca3af);"></td>
            </tr>

            <tr>
              <td style="padding:18px 24px;background:#ffffff;border-bottom:1px solid #f3f4f6;">
                <div class="text-primary" style="font-weight:800;font-size:14px;color:#111827;letter-spacing:0.2px;">Booking Cancelled</div>
              </td>
            </tr>

            <tr>
              <td style="padding:24px;background:#ffffff;">
                <div style="font-size:14px;line-height:1.7;color:#111827;margin:0 0 12px;">
                  <div class="text-primary" style="font-weight:800;color:#111827;">Hi ${escapeHtml(toSentenceCase(params.guestName))},</div>
                  <div class="text-secondary" style="margin-top:8px;color:#374151;">
                    Your 15‑minute chat has been cancelled.
                  </div>
                </div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0" class="card-inner" style="border:1px solid #e5e7eb;border-radius:12px;background:#f9fafb;">
                  <tr>
                    <td style="padding:14px 16px;">
                      <div class="text-muted" style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.06em;">Was scheduled for</div>
                      <div class="text-primary" style="font-size:14px;font-weight:700;color:#111827;margin-top:4px;">${escapeHtml(when)}</div>
                      <div class="text-muted" style="font-size:11px;color:#6b7280;margin-top:4px;">Timezone: ${escapeHtml(params.guestTimeZone)}</div>
                    </td>
                  </tr>
                </table>

                <div style="height:20px;"></div>

                <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                  <tr>
                    <td align="center">
                      <table role="presentation" cellpadding="0" cellspacing="0">
                        <tr>
                          <td class="btn-join" style="background:#0066ff;border-radius:999px;">
                            <a href="${escapeHtml(params.siteUrl + '/book')}" style="display:inline-block;padding:10px 22px;color:#ffffff;text-decoration:none;font-weight:700;font-size:13px;">
                              Book again
                            </a>
                          </td>
                        </tr>
                      </table>
                    </td>
                  </tr>
                </table>

                <div style="height:24px;"></div>
                <div class="text-secondary" style="font-size:14px;line-height:1.7;color:#374151;">
                  Hope to chat another time!<br/>
                  — <span style="color:#111827;">Manish</span>
                </div>
              </td>
            </tr>

            <tr>
              <td class="footer-border" style="padding:16px 24px;background:#ffffff;border-top:1px solid #f3f4f6;">
                <a href="${escapeHtml(params.siteUrl)}" style="color:#4b5563;text-decoration:none;font-weight:600;font-size:13px;">
                  View Portfolio &#8599;
                </a>
                <div class="text-muted" style="margin-top:8px;font-size:11px;color:#9ca3af;">
                  This is an automated message — please do not reply.
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Hi ${params.guestName},

Your 15‑minute chat has been cancelled.

Was scheduled for: ${when}
Timezone: ${params.guestTimeZone}

If you'd like to book again, visit: ${params.siteUrl}/book

— Manish
${params.siteUrl}`;

  return { subject, html, text };
}

export function buildAdminCancellationEmail(params: {
  guestEmail: string;
  startISO: string;
  endISO: string;
}) {
  const ownerTz = process.env.GOOGLE_CALENDAR_TIMEZONE ?? DEFAULT_OWNER_TZ;
  const whenOwner = fmtRange(params.startISO, params.endISO, ownerTz);
  const subject = `Cancelled booking — ${whenOwner.split(',')[0]}`;

  const html = `<!doctype html>
<html>
  <body style="margin:0;padding:0;background:#ffffff;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;color:#111827;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="width:600px;max-width:600px;border:1px solid #e5e7eb;border-radius:16px;overflow:hidden;">
            <tr>
              <td style="padding:16px 20px;background:#111827;color:#ffffff;">
                <div style="font-weight:800;">Booking Cancelled</div>
                <div style="font-size:12px;color:rgba(255,255,255,0.8);margin-top:4px;">${escapeHtml(whenOwner)} (NYC time)</div>
              </td>
            </tr>
            <tr>
              <td style="padding:20px;background:#ffffff;">
                <div style="font-size:14px;line-height:1.7;color:#111827;">
                  <div><strong>Guest:</strong> ${escapeHtml(params.guestEmail)}</div>
                  <div style="margin-top:6px;"><strong>When:</strong> ${escapeHtml(whenOwner)}</div>
                </div>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Booking cancelled (NYC time)\n\nWhen: ${whenOwner}\nGuest: ${params.guestEmail}`;

  return { subject, html, text };
}
