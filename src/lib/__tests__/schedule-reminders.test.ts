import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DateTime } from 'luxon';

// Mock googleapis (needed by google-calendar)
vi.mock('googleapis', () => ({
  google: { calendar: () => ({}) },
}));

// Mock google-auth
vi.mock('@/lib/google-auth', () => ({
  getCalendarAuthClient: () => ({}),
}));

// Mock google-calendar
const mockListUpcomingBookings = vi.fn();
const mockSetEventExtendedProperty = vi.fn();
vi.mock('@/lib/google-calendar', () => ({
  listUpcomingBookings: (...args: any[]) => mockListUpcomingBookings(...args),
  setEventExtendedProperty: (...args: any[]) => mockSetEventExtendedProperty(...args),
}));

// Mock booking-email
vi.mock('@/lib/booking-email', () => ({
  buildReminderEmail: () => ({ subject: 'Reminder', html: '<p>Reminder</p>', text: 'Reminder' }),
}));

// Mock booking-ics
vi.mock('@/lib/booking-ics', () => ({
  buildIcsFile: () => 'BEGIN:VCALENDAR\nEND:VCALENDAR',
}));

// Mock booking-token
vi.mock('@/lib/booking-token', () => ({
  createBookingManageToken: () => 'mock-token',
}));

// Mock Resend
const mockResendSend = vi.fn();
vi.mock('resend', () => ({
  Resend: class {
    emails = { send: mockResendSend };
  },
}));

// Set env vars before importing
process.env.GOOGLE_CALENDAR_ID = 'test-calendar';
process.env.RESEND_API_KEY = 'test-key';
process.env.RESEND_FROM_EMAIL = 'test@example.com';
process.env.BOOKING_SIGNING_SECRET = 'test-secret';
process.env.SITE_NAME = 'Test';

import { scheduleBookingReminders } from '../schedule-reminders';

function makeEvent(overrides: any = {}) {
  const start = overrides.startISO ?? DateTime.now().plus({ hours: 25 }).toUTC().toISO();
  const end = overrides.endISO ?? DateTime.fromISO(start).plus({ minutes: 15 }).toISO();
  return {
    id: overrides.id ?? 'event-1',
    summary: overrides.summary ?? '15-min chat: John (Job Seeker)',
    description: overrides.description ?? 'Email: john@example.com\nGuest timezone: America/Chicago\nAgenda: Career chat',
    start: { dateTime: start },
    end: { dateTime: end },
    hangoutLink: overrides.hangoutLink ?? 'https://meet.google.com/abc',
    extendedProperties: { private: overrides.privateProps ?? {} },
    ...overrides.extra,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  mockResendSend.mockResolvedValue({ data: { id: 'email-123' }, error: null });
});

describe('scheduleBookingReminders', () => {
  it('schedules 24h reminder when event is 24-36h away', async () => {
    const event = makeEvent({ startISO: DateTime.now().plus({ hours: 25 }).toUTC().toISO() });
    mockListUpcomingBookings.mockResolvedValue([event]);

    const result = await scheduleBookingReminders();
    expect(result.processed).toBe(1);
    expect(mockResendSend).toHaveBeenCalled();
    const calls = mockResendSend.mock.calls;
    // Should have 24h reminder scheduled
    const has24h = calls.some((c: any) => c[0]?.scheduledAt);
    expect(has24h).toBe(true);
  });

  it('schedules 1h reminder when event is 1-13h away', async () => {
    const event = makeEvent({ startISO: DateTime.now().plus({ hours: 5 }).toUTC().toISO() });
    mockListUpcomingBookings.mockResolvedValue([event]);

    const result = await scheduleBookingReminders();
    expect(result.processed).toBe(1);
    // The 1h reminder send time (event - 1h) = now + 4h, which is in window
    const calls = mockResendSend.mock.calls;
    expect(calls.length).toBeGreaterThan(0);
  });

  it('skips reminders when both are outside window', async () => {
    // Event 35h away: 24h reminder send time = 11h from now (in window) but 1h reminder = 34h (out of window)
    // Event 48h away: 24h reminder send time = 24h from now (out of 12h window)
    const event = makeEvent({ startISO: DateTime.now().plus({ hours: 48 }).toUTC().toISO() });
    mockListUpcomingBookings.mockResolvedValue([event]);

    await scheduleBookingReminders();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('skips already-sent 24h reminder', async () => {
    const event = makeEvent({
      startISO: DateTime.now().plus({ hours: 25 }).toUTC().toISO(),
      privateProps: { reminder_24h_sent: 'true' },
    });
    mockListUpcomingBookings.mockResolvedValue([event]);

    await scheduleBookingReminders();
    // Should not send 24h, but may try 1h if in window
    const calls = mockResendSend.mock.calls;
    const scheduled24h = calls.filter((c: any) => {
      const scheduledAt = c[0]?.scheduledAt;
      if (!scheduledAt) return false;
      // 24h reminder is scheduled at event-24h, 1h at event-1h
      const diff = DateTime.fromISO(event.start.dateTime).diff(DateTime.fromISO(scheduledAt), 'hours').hours;
      return Math.abs(diff - 24) < 1;
    });
    expect(scheduled24h).toHaveLength(0);
  });

  it('skips events with missing email', async () => {
    const event = makeEvent({ description: 'No email here\nAgenda: test' });
    mockListUpcomingBookings.mockResolvedValue([event]);

    await scheduleBookingReminders();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('handles Resend send failure gracefully', async () => {
    const event = makeEvent({ startISO: DateTime.now().plus({ hours: 25 }).toUTC().toISO() });
    mockListUpcomingBookings.mockResolvedValue([event]);
    mockResendSend.mockResolvedValue({ data: null, error: { message: 'Rate limited' } });

    const result = await scheduleBookingReminders();
    expect(result.results.some((r: string) => r.includes('FAILED'))).toBe(true);
    // Should NOT set extended property on failure
    expect(mockSetEventExtendedProperty).not.toHaveBeenCalled();
  });

  it('skips past events', async () => {
    const event = makeEvent({ startISO: DateTime.now().minus({ hours: 1 }).toUTC().toISO() });
    mockListUpcomingBookings.mockResolvedValue([event]);

    await scheduleBookingReminders();
    expect(mockResendSend).not.toHaveBeenCalled();
  });

  it('uses correct scheduledAt times', async () => {
    const eventStart = DateTime.now().plus({ hours: 6 }).toUTC();
    const event = makeEvent({ startISO: eventStart.toISO() });
    mockListUpcomingBookings.mockResolvedValue([event]);

    await scheduleBookingReminders();

    // 1h reminder should be at eventStart - 1h = now + 5h (within 12h window)
    // 24h reminder send time = eventStart - 24h = now - 18h (in the past, should be skipped)
    const calls = mockResendSend.mock.calls;
    for (const call of calls) {
      const scheduledAt = call[0]?.scheduledAt;
      if (scheduledAt) {
        const scheduledDt = DateTime.fromISO(scheduledAt);
        const diffFromEvent = eventStart.diff(scheduledDt, 'hours').hours;
        // Should be either ~1h or ~24h before the event
        expect(diffFromEvent === 1 || Math.abs(diffFromEvent - 1) < 0.1).toBe(true);
      }
    }
  });
});
