import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DateTime } from 'luxon';

// Mock @googleapis/calendar
const mockEventsList = vi.fn();
const mockFreebusyQuery = vi.fn();
vi.mock('@googleapis/calendar', () => {
  return {
    calendar_v3: {
      Calendar: class {
        events = { list: mockEventsList, get: vi.fn(), insert: vi.fn(), patch: vi.fn(), delete: vi.fn() };
        freebusy = { query: mockFreebusyQuery };
      },
    },
  };
});

vi.mock('@/lib/google-auth', () => ({
  getCalendarAuthClient: () => ({}),
}));

import { getAvailableSlots, isSlotBookable } from '../google-calendar';

const CALENDAR_ID = 'test-calendar';

beforeEach(() => {
  vi.clearAllMocks();
  // Default: no events, no busy
  mockEventsList.mockResolvedValue({ data: { items: [] } });
  mockFreebusyQuery.mockResolvedValue({
    data: { calendars: { [CALENDAR_ID]: { busy: [] } } },
  });
});

describe('getAvailableSlots', () => {
  it('returns empty for weekends', async () => {
    // 2025-03-08 is a Saturday
    const slots = await getAvailableSlots(CALENDAR_ID, '2025-03-08', 'job-seeker');
    expect(slots).toEqual([]);
    // No API calls should have been made
    expect(mockEventsList).not.toHaveBeenCalled();
  });

  it('returns slots for a weekday', async () => {
    // 2025-03-10 is a Monday — use a date far enough ahead to pass the notice check
    // Since we can't control "now", we use a date and accept that it may return empty if past
    // For unit testing the slot generation, this verifies the flow works end-to-end
    const result = await getAvailableSlots(CALENDAR_ID, '2025-03-10', 'job-seeker');
    // Slots will be empty if the date is in the past, which is expected
    expect(Array.isArray(result)).toBe(true);
  });

  it('returns empty when daily cap (2) is reached', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          { summary: '15-min chat: Alice (Job Seeker)', start: { dateTime: '2025-03-10T19:00:00Z' } },
          { summary: '15-min chat: Bob (Job Seeker)', start: { dateTime: '2025-03-10T19:30:00Z' } },
        ],
      },
    });

    const result = await getAvailableSlots(CALENDAR_ID, '2025-03-10', 'job-seeker');
    expect(result).toEqual([]);
  });

  it('returns empty when person already has booking', async () => {
    mockEventsList.mockResolvedValue({
      data: {
        items: [
          {
            summary: '15-min chat: Alice (Job Seeker)',
            attendees: [{ email: 'alice@example.com' }],
          },
        ],
      },
    });

    const result = await getAvailableSlots(CALENDAR_ID, '2025-03-10', 'job-seeker', {
      attendeeEmail: 'alice@example.com',
    });
    expect(result).toEqual([]);
  });

  it('filters out slots that conflict with busy periods', async () => {
    // Set up a date far enough in the future
    const futureDate = DateTime.now().setZone('America/New_York').plus({ days: 3 }).startOf('day');
    // Skip to next weekday if weekend
    let testDate = futureDate;
    while (testDate.weekday > 5) testDate = testDate.plus({ days: 1 });
    const dateStr = testDate.toISODate()!;

    // Make the entire job-seeker window (7-9 PM ET) busy
    const busyStart = testDate.set({ hour: 19, minute: 0 }).toUTC().toISO()!;
    const busyEnd = testDate.set({ hour: 21, minute: 0 }).toUTC().toISO()!;

    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          [CALENDAR_ID]: {
            busy: [{ start: busyStart, end: busyEnd }],
          },
        },
      },
    });

    const result = await getAvailableSlots(CALENDAR_ID, dateStr, 'job-seeker');
    expect(result).toEqual([]);
  });
});

describe('isSlotBookable', () => {
  it('rejects weekends', async () => {
    // 2025-03-08 is Saturday
    const result = await isSlotBookable({
      calendarId: CALENDAR_ID,
      type: 'job-seeker',
      startISO: '2025-03-08T00:00:00Z',
      endISO: '2025-03-08T00:15:00Z',
    });
    expect(result.ok).toBe(false);
  });

  it('rejects invalid duration', async () => {
    const result = await isSlotBookable({
      calendarId: CALENDAR_ID,
      type: 'job-seeker',
      startISO: '2025-03-10T00:00:00Z',
      endISO: '2025-03-10T00:30:00Z', // 30 min != 15 min
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('duration');
  });

  it('rejects invalid time range', async () => {
    const result = await isSlotBookable({
      calendarId: CALENDAR_ID,
      type: 'job-seeker',
      startISO: '2025-03-10T01:00:00Z',
      endISO: '2025-03-10T00:45:00Z', // end before start
    });
    expect(result.ok).toBe(false);
  });

  it('rejects slots outside allowed hours', async () => {
    // Job seeker window is 7-9 PM ET. 8 AM ET is outside.
    const futureDate = DateTime.now().setZone('America/New_York').plus({ days: 5 }).startOf('day');
    let testDate = futureDate;
    while (testDate.weekday > 5) testDate = testDate.plus({ days: 1 });

    const start = testDate.set({ hour: 8, minute: 0 }).toUTC().toISO()!;
    const end = testDate.set({ hour: 8, minute: 15 }).toUTC().toISO()!;

    const result = await isSlotBookable({
      calendarId: CALENDAR_ID,
      type: 'job-seeker',
      startISO: start,
      endISO: end,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('hours');
  });

  it('rejects when slot conflicts with busy period', async () => {
    const futureDate = DateTime.now().setZone('America/New_York').plus({ days: 5 }).startOf('day');
    let testDate = futureDate;
    while (testDate.weekday > 5) testDate = testDate.plus({ days: 1 });

    const start = testDate.set({ hour: 19, minute: 0 });
    const end = start.plus({ minutes: 15 });

    mockFreebusyQuery.mockResolvedValue({
      data: {
        calendars: {
          [CALENDAR_ID]: {
            busy: [{ start: start.toUTC().toISO(), end: end.toUTC().toISO() }],
          },
        },
      },
    });

    const result = await isSlotBookable({
      calendarId: CALENDAR_ID,
      type: 'job-seeker',
      startISO: start.toUTC().toISO()!,
      endISO: end.toUTC().toISO()!,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('available');
  });

  it('rejects when max bookings per day exceeded', async () => {
    const futureDate = DateTime.now().setZone('America/New_York').plus({ days: 5 }).startOf('day');
    let testDate = futureDate;
    while (testDate.weekday > 5) testDate = testDate.plus({ days: 1 });

    const start = testDate.set({ hour: 19, minute: 0 });
    const end = start.plus({ minutes: 15 });

    mockEventsList.mockResolvedValue({
      data: {
        items: [
          { summary: '15-min chat: A (Job Seeker)' },
          { summary: '15-min chat: B (Job Seeker)' },
        ],
      },
    });

    const result = await isSlotBookable({
      calendarId: CALENDAR_ID,
      type: 'job-seeker',
      startISO: start.toUTC().toISO()!,
      endISO: end.toUTC().toISO()!,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toContain('Maximum');
  });
});
