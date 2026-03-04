import { calendar_v3 } from '@googleapis/calendar';
import { DateTime } from 'luxon';
import crypto from 'crypto';
import { getCalendarAuthClient } from './google-auth';

const TIMEZONE = process.env.GOOGLE_CALENDAR_TIMEZONE ?? 'America/New_York';
const SLOT_DURATION_MINUTES = 15;
const BOOKING_BUFFER_MINUTES = 15;
const MAX_DAYS_AHEAD = 14;
const MIN_NOTICE_HOURS = 12;
const BOOKING_SUMMARY_PREFIX = '15-min chat:';

export type BookingType = 'job-seeker' | 'networking';

/** Job Seeker: after 7 PM. Peer Networking: 1–3 PM (all in site timezone). */
export function getSlotWindowForType(type: BookingType): { startHour: number; startMinute: number; endHour: number; endMinute: number } {
  if (type === 'job-seeker') {
    return { startHour: 19, startMinute: 0, endHour: 21, endMinute: 0 }; // 7 PM - 9 PM
  }
  return { startHour: 13, startMinute: 0, endHour: 15, endMinute: 0 }; // 1 PM - 3 PM
}

function getCalendarClient(auth: any) {
  return new calendar_v3.Calendar({ auth });
}

export async function getFreeBusy(calendarId: string, timeMin: Date, timeMax: Date) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  const res = await calendar.freebusy.query({
    requestBody: {
      timeMin: timeMin.toISOString(),
      timeMax: timeMax.toISOString(),
      timeZone: TIMEZONE,
      items: [{ id: calendarId }],
    },
  });
  const cal = res.data.calendars?.[calendarId];
  if (!cal) return { busy: [] };
  return { busy: cal.busy ?? [] };
}

/** Generate 15-min slots for a given date within the type's window (timezone-aware). */
export function generateSlotCandidates(date: DateTime, type: BookingType): { start: DateTime; end: DateTime }[] {
  const { startHour, startMinute, endHour, endMinute } = getSlotWindowForType(type);
  const slots: { start: DateTime; end: DateTime }[] = [];
  const start = date.set({ hour: startHour, minute: startMinute, second: 0, millisecond: 0 });
  const end = date.set({ hour: endHour, minute: endMinute, second: 0, millisecond: 0 });

  let cursor = start;
  while (cursor < end) {
    const slotEnd = cursor.plus({ minutes: SLOT_DURATION_MINUTES });
    if (slotEnd <= end) {
      slots.push({ start: cursor, end: slotEnd });
    }
    cursor = cursor.plus({ minutes: SLOT_DURATION_MINUTES });
  }
  return slots;
}

export function isSlotFree(slot: { start: DateTime; end: DateTime }, busy: { start?: string | null; end?: string | null }[]): boolean {
  const slotStart = slot.start.toMillis();
  const slotEnd = slot.end.toMillis();
  for (const b of busy) {
    if (!b.start || !b.end) continue;
    // Buffer both sides so we always keep a 15-min gap between meetings.
    const bStart = new Date(b.start).getTime() - BOOKING_BUFFER_MINUTES * 60 * 1000;
    const bEnd = new Date(b.end).getTime() + BOOKING_BUFFER_MINUTES * 60 * 1000;
    if (slotStart < bEnd && slotEnd > bStart) return false;
  }
  return true;
}

async function listEvents(calendarId: string, timeMinISO: string, timeMaxISO: string) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  const res = await calendar.events.list({
    calendarId,
    timeMin: timeMinISO,
    timeMax: timeMaxISO,
    singleEvents: true,
    orderBy: 'startTime',
    maxResults: 250,
  });
  return res.data.items ?? [];
}

// Pure helpers that operate on pre-fetched events (no API calls)
function hasPersonBookingInEvents(events: any[], email: string, ignoreEventId?: string): boolean {
  return events.some((e: any) => {
    if (ignoreEventId && e?.id === ignoreEventId) return false;
    const summary = typeof e?.summary === 'string' ? e.summary : '';
    if (!summary.startsWith(BOOKING_SUMMARY_PREFIX)) return false;
    const attendees = e.attendees ?? [];
    return attendees.some((a: any) => a.email === email);
  });
}

function countBookingsInEvents(events: any[]): number {
  return events.filter((e: any) => {
    const summary = typeof e?.summary === 'string' ? e.summary : '';
    return summary.startsWith(BOOKING_SUMMARY_PREFIX);
  }).length;
}

function getLatestAllowedDay(): DateTime {
  let addedDays = 0;
  let current = DateTime.now().setZone(TIMEZONE).startOf('day');
  while (addedDays < MAX_DAYS_AHEAD) {
    if (current.weekday < 6) addedDays++;
    current = current.plus({ days: 1 });
  }
  return current.minus({ days: 1 }).endOf('day');
}

export async function hasBookingOnDay(calendarId: string, day: DateTime, ignoreEventId?: string): Promise<boolean> {
  const timeMinISO = day.startOf('day').toUTC().toISO()!;
  const timeMaxISO = day.endOf('day').toUTC().toISO()!;
  const events = await listEvents(calendarId, timeMinISO, timeMaxISO);
  return events.some((e: any) => {
    if (ignoreEventId && e?.id === ignoreEventId) return false;
    const summary = typeof e?.summary === 'string' ? e.summary : '';
    return summary.startsWith(BOOKING_SUMMARY_PREFIX);
  });
}

/** Get available slots for a date and booking type. */
export async function getAvailableSlots(
  calendarId: string,
  dateStr: string,
  type: BookingType,
  opts?: { ignoreEventId?: string; attendeeEmail?: string }
): Promise<{ start: string; end: string }[]> {
  const day = DateTime.fromISO(dateStr, { zone: TIMEZONE });
  if (!day.isValid) throw new Error('Invalid date');
  if (day.weekday > 5) return [];

  const now = DateTime.now().setZone(TIMEZONE);
  if (day < now.startOf('day') || day > getLatestAllowedDay()) return [];

  const timeMinISO = day.startOf('day').toUTC().toISO()!;
  const timeMaxISO = day.endOf('day').toUTC().toISO()!;
  const timeMin = day.startOf('day').toUTC().toJSDate();
  const timeMax = day.endOf('day').toUTC().toJSDate();

  // Single listEvents + getFreeBusy in parallel
  const [events, { busy }] = await Promise.all([
    listEvents(calendarId, timeMinISO, timeMaxISO),
    getFreeBusy(calendarId, timeMin, timeMax),
  ]);

  // Check per-person and daily booking limits using pre-fetched events
  if (opts?.attendeeEmail && hasPersonBookingInEvents(events, opts.attendeeEmail, opts.ignoreEventId)) {
    return [];
  }
  if (countBookingsInEvents(events) >= 2) return [];

  const slots = generateSlotCandidates(day, type);
  const free = slots.filter((s) => {
    if (!isSlotFree(s, busy)) return false;
    if (s.start.hasSame(now, 'day')) {
      return s.start.toMillis() >= now.plus({ hours: MIN_NOTICE_HOURS }).toMillis();
    }
    return true;
  });

  return free.map((s) => ({
    start: s.start.toUTC().toISO()!,
    end: s.end.toUTC().toISO()!,
  }));
}

export function getOwnerTimezone() {
  return TIMEZONE;
}

export function getBookingConstraints() {
  return {
    slotDurationMinutes: SLOT_DURATION_MINUTES,
    bufferMinutes: BOOKING_BUFFER_MINUTES,
    maxDaysAhead: MAX_DAYS_AHEAD,
    minNoticeHours: MIN_NOTICE_HOURS,
  };
}

// Checks if this person has already booked today
export async function hasBookingForPersonOnDay(calendarId: string, day: DateTime, email: string, ignoreEventId?: string): Promise<boolean> {
  const timeMinISO = day.startOf('day').toUTC().toISO()!;
  const timeMaxISO = day.endOf('day').toUTC().toISO()!;
  const events = await listEvents(calendarId, timeMinISO, timeMaxISO);
  return hasPersonBookingInEvents(events, email, ignoreEventId);
}

// Count total bookings for this day
export async function countBookingsOnDay(calendarId: string, day: DateTime): Promise<number> {
  const timeMinISO = day.startOf('day').toUTC().toISO()!;
  const timeMaxISO = day.endOf('day').toUTC().toISO()!;
  const events = await listEvents(calendarId, timeMinISO, timeMaxISO);
  return countBookingsInEvents(events);
}

export async function isSlotBookable(params: {
  calendarId: string;
  type: BookingType;
  startISO: string;
  endISO: string;
  ignoreEventId?: string;
  attendeeEmail?: string;
}): Promise<{ ok: true; day: DateTime } | { ok: false; reason: string }> {
  const { calendarId, type, startISO, endISO, ignoreEventId, attendeeEmail } = params;

  const startUtc = DateTime.fromISO(startISO, { zone: 'utc' });
  const endUtc = DateTime.fromISO(endISO, { zone: 'utc' });
  if (!startUtc.isValid || !endUtc.isValid) return { ok: false, reason: 'Invalid start or end time' };

  const start = startUtc.setZone(TIMEZONE);
  const end = endUtc.setZone(TIMEZONE);

  if (end <= start) return { ok: false, reason: 'Invalid time range' };
  const durationMinutes = Math.round(end.diff(start, 'minutes').minutes);
  if (durationMinutes !== SLOT_DURATION_MINUTES) return { ok: false, reason: 'Invalid slot duration' };

  const now = DateTime.now().setZone(TIMEZONE);
  if (start.toMillis() < now.plus({ hours: MIN_NOTICE_HOURS }).toMillis()) {
    return { ok: false, reason: 'Not enough notice' };
  }
  const latest = now.plus({ days: MAX_DAYS_AHEAD - 1 }).endOf('day');
  if (start < now.startOf('day') || start > latest) return { ok: false, reason: 'Outside booking window' };

  const window = getSlotWindowForType(type);
  const day = start.startOf('day');
  const winStart = day.set({ hour: window.startHour, minute: window.startMinute, second: 0, millisecond: 0 });
  const winEnd = day.set({ hour: window.endHour, minute: window.endMinute, second: 0, millisecond: 0 });
  if (start < winStart || end > winEnd) return { ok: false, reason: 'Outside allowed hours' };

  if (start.weekday === 6 || start.weekday === 7) {
    return { ok: false, reason: 'Bookings not allowed on weekends' };
  }

  const timeMinISO = day.startOf('day').toUTC().toISO()!;
  const timeMaxISO = day.endOf('day').toUTC().toISO()!;
  const timeMin = day.startOf('day').toUTC().toJSDate();
  const timeMax = day.endOf('day').toUTC().toJSDate();

  // Single listEvents + getFreeBusy in parallel
  const [events, { busy }] = await Promise.all([
    listEvents(calendarId, timeMinISO, timeMaxISO),
    getFreeBusy(calendarId, timeMin, timeMax),
  ]);

  if (attendeeEmail && hasPersonBookingInEvents(events, attendeeEmail, ignoreEventId)) {
    return { ok: false, reason: 'You already have a booking on this day' };
  }

  if (countBookingsInEvents(events) >= 2) {
    return { ok: false, reason: 'Maximum 2 bookings allowed on this day' };
  }

  const slot = { start, end };
  if (!isSlotFree(slot, busy)) return { ok: false, reason: 'Time slot no longer available' };

  return { ok: true, day };
}

export async function createCalendarEvent(
  calendarId: string,
  params: { start: string; end: string; summary: string; description?: string }
) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  const requestId = crypto.randomUUID();
  const event: {
    start: { dateTime: string; timeZone: string };
    end: { dateTime: string; timeZone: string };
    summary: string;
    description?: string;
    conferenceData?: { createRequest: { requestId: string; conferenceSolutionKey: { type: 'hangoutsMeet' } } };
  } = {
    start: { dateTime: params.start, timeZone: TIMEZONE },
    end: { dateTime: params.end, timeZone: TIMEZONE },
    summary: params.summary,
    conferenceData: {
      createRequest: {
        requestId,
        conferenceSolutionKey: { type: 'hangoutsMeet' },
      },
    },
  };
  if (params.description) event.description = params.description;
  const res = await calendar.events.insert({ calendarId, requestBody: event, conferenceDataVersion: 1 });
  return res.data;
}

export async function getCalendarEvent(calendarId: string, eventId: string) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  const res = await calendar.events.get({ calendarId, eventId });
  return res.data;
}

export async function updateCalendarEventTime(calendarId: string, eventId: string, params: { start: string; end: string }) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  const res = await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      start: { dateTime: params.start, timeZone: TIMEZONE },
      end: { dateTime: params.end, timeZone: TIMEZONE },
    },
    conferenceDataVersion: 1,
  });
  return res.data;
}

export async function deleteCalendarEvent(calendarId: string, eventId: string) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  await calendar.events.delete({ calendarId, eventId });
}

/**
 * List upcoming booking events within a time range.
 * Only returns events whose summary starts with BOOKING_SUMMARY_PREFIX.
 */
export async function listUpcomingBookings(calendarId: string, timeMinISO: string, timeMaxISO: string) {
  const events = await listEvents(calendarId, timeMinISO, timeMaxISO);
  return events.filter((e: any) => {
    const summary = typeof e?.summary === 'string' ? e.summary : '';
    return summary.startsWith(BOOKING_SUMMARY_PREFIX);
  });
}

/**
 * Set a private extended property on a calendar event (used to track sent reminders).
 */
export async function setEventExtendedProperty(calendarId: string, eventId: string, key: string, value: string) {
  const auth = getCalendarAuthClient();
  const calendar = getCalendarClient(auth);
  await calendar.events.patch({
    calendarId,
    eventId,
    requestBody: {
      extendedProperties: {
        private: { [key]: value },
      },
    },
  });
}
