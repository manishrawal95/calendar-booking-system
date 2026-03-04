import { DateTime } from 'luxon';
import crypto from 'crypto';

/**
 * Generate an .ics (iCalendar) file for a booking.
 *
 * Key design decisions:
 * - Uses IANA timezone IDs (e.g. America/Chicago) with DTSTART;TZID=…
 *   so Outlook, Apple Calendar, and Google Calendar all display the
 *   event in the guest's local timezone.
 * - Includes a VTIMEZONE block derived from Luxon offset data for the
 *   specific event date so older clients can resolve the TZID.
 */

function pad2(n: number) {
  return n.toString().padStart(2, '0');
}

/** Format a Luxon DateTime as an iCalendar local-time string: YYYYMMDDTHHMMSS */
function icsLocal(dt: DateTime): string {
  return (
    `${dt.year}${pad2(dt.month)}${pad2(dt.day)}T` +
    `${pad2(dt.hour)}${pad2(dt.minute)}${pad2(dt.second)}`
  );
}

/** Format a JS Date as an iCalendar UTC string: YYYYMMDDTHHMMSSZ */
function icsUtc(d: Date): string {
  return (
    `${d.getUTCFullYear()}${pad2(d.getUTCMonth() + 1)}${pad2(d.getUTCDate())}T` +
    `${pad2(d.getUTCHours())}${pad2(d.getUTCMinutes())}${pad2(d.getUTCSeconds())}Z`
  );
}

/**
 * Build a minimal VTIMEZONE block for a given IANA timezone at a specific date.
 *
 * We find the Standard and Daylight transitions that bracket the event date
 * by probing month-by-month through the year. If no DST exists (e.g. Arizona)
 * we emit only a STANDARD component.
 */
function buildVTimezone(tz: string, refDate: DateTime): string {
  const year = refDate.year;
  // Probe offsets at the 1st of each month
  const offsets: { month: number; offset: number }[] = [];
  for (let m = 1; m <= 12; m++) {
    const dt = DateTime.fromObject({ year, month: m, day: 1 }, { zone: tz });
    offsets.push({ month: m, offset: dt.offset }); // offset in minutes
  }

  const uniqueOffsets = Array.from(new Set(offsets.map((o) => o.offset)));

  function fmtOffset(minutes: number): string {
    const sign = minutes >= 0 ? '+' : '-';
    const abs = Math.abs(minutes);
    const h = Math.floor(abs / 60);
    const m = abs % 60;
    return `${sign}${pad2(h)}${pad2(m)}`;
  }

  if (uniqueOffsets.length === 1) {
    // No DST
    const off = fmtOffset(uniqueOffsets[0]);
    return [
      'BEGIN:VTIMEZONE',
      `TZID:${tz}`,
      'BEGIN:STANDARD',
      `DTSTART:${year}0101T000000`,
      `TZOFFSETFROM:${off}`,
      `TZOFFSETTO:${off}`,
      'END:STANDARD',
      'END:VTIMEZONE',
    ].join('\r\n');
  }

  // Find DST transitions
  // Standard = smaller offset (winter), Daylight = larger offset (summer)
  // In northern hemisphere daylight offset > standard offset
  const sorted = [...uniqueOffsets].sort((a, b) => a - b);
  const stdOffset = sorted[0];
  const dstOffset = sorted[sorted.length - 1];

  // Find the month where transition occurs
  let dstStartMonth = 3; // fallback
  let stdStartMonth = 11;
  for (let i = 1; i < offsets.length; i++) {
    if (offsets[i].offset === dstOffset && offsets[i - 1].offset === stdOffset) {
      dstStartMonth = offsets[i].month;
    }
    if (offsets[i].offset === stdOffset && offsets[i - 1].offset === dstOffset) {
      stdStartMonth = offsets[i].month;
    }
  }

  const stdOff = fmtOffset(stdOffset);
  const dstOff = fmtOffset(dstOffset);

  return [
    'BEGIN:VTIMEZONE',
    `TZID:${tz}`,
    'BEGIN:STANDARD',
    `DTSTART:${year}${pad2(stdStartMonth)}01T020000`,
    `TZOFFSETFROM:${dstOff}`,
    `TZOFFSETTO:${stdOff}`,
    'END:STANDARD',
    'BEGIN:DAYLIGHT',
    `DTSTART:${year}${pad2(dstStartMonth)}01T020000`,
    `TZOFFSETFROM:${stdOff}`,
    `TZOFFSETTO:${dstOff}`,
    'END:DAYLIGHT',
    'END:VTIMEZONE',
  ].join('\r\n');
}

/** Fold lines longer than 75 octets per RFC 5545 §3.1 */
function foldLine(line: string): string {
  if (line.length <= 75) return line;
  const parts: string[] = [];
  parts.push(line.slice(0, 75));
  let i = 75;
  while (i < line.length) {
    parts.push(' ' + line.slice(i, i + 74));
    i += 74;
  }
  return parts.join('\r\n');
}

export function buildIcsFile(params: {
  startISO: string;
  endISO: string;
  timezone: string;
  summary: string;
  description?: string;
  meetLink?: string | null;
  organizerName?: string;
  organizerEmail?: string;
}): string {
  const tz = params.timezone;
  const start = DateTime.fromISO(params.startISO, { zone: 'utc' }).setZone(tz);
  const end = DateTime.fromISO(params.endISO, { zone: 'utc' }).setZone(tz);

  const uid = `${crypto.randomUUID()}@mrawal.com`;
  const now = icsUtc(new Date());

  const vtimezone = buildVTimezone(tz, start);

  const lines: string[] = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//mrawal.com//BookingSystem//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    vtimezone,
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART;TZID=${tz}:${icsLocal(start)}`,
    `DTEND;TZID=${tz}:${icsLocal(end)}`,
    foldLine(`SUMMARY:${params.summary}`),
  ];

  if (params.description) {
    // iCalendar uses escaped newlines
    const escaped = params.description.replace(/\\/g, '\\\\').replace(/,/g, '\\,').replace(/;/g, '\\;').replace(/\n/g, '\\n');
    lines.push(foldLine(`DESCRIPTION:${escaped}`));
  }

  if (params.meetLink) {
    lines.push(foldLine(`URL:${params.meetLink}`));
    lines.push(foldLine(`LOCATION:${params.meetLink}`));
  }

  if (params.organizerName && params.organizerEmail) {
    lines.push(foldLine(`ORGANIZER;CN=${params.organizerName}:mailto:${params.organizerEmail}`));
  }

  lines.push('STATUS:CONFIRMED');
  lines.push('BEGIN:VALARM');
  lines.push('TRIGGER:-PT15M');
  lines.push('ACTION:DISPLAY');
  lines.push('DESCRIPTION:Reminder');
  lines.push('END:VALARM');
  lines.push('END:VEVENT');
  lines.push('END:VCALENDAR');

  return lines.join('\r\n');
}
