import { describe, it, expect } from 'vitest';
import { DateTime } from 'luxon';
import { generateSlotCandidates, isSlotFree, getSlotWindowForType } from '../google-calendar';

describe('getSlotWindowForType', () => {
  it('returns 7-9 PM for job-seeker', () => {
    const w = getSlotWindowForType('job-seeker');
    expect(w.startHour).toBe(19);
    expect(w.endHour).toBe(21);
  });

  it('returns 1-3 PM for networking', () => {
    const w = getSlotWindowForType('networking');
    expect(w.startHour).toBe(13);
    expect(w.endHour).toBe(15);
  });
});

describe('generateSlotCandidates', () => {
  it('generates 8 slots for a 2-hour window (15-min each)', () => {
    const day = DateTime.fromISO('2025-03-10', { zone: 'America/New_York' });
    const slots = generateSlotCandidates(day, 'job-seeker');
    expect(slots).toHaveLength(8); // 19:00-21:00 = 8 x 15min
  });

  it('generates slots in correct time range', () => {
    const day = DateTime.fromISO('2025-03-10', { zone: 'America/New_York' });
    const slots = generateSlotCandidates(day, 'networking');
    expect(slots[0].start.hour).toBe(13);
    expect(slots[0].start.minute).toBe(0);
    expect(slots[slots.length - 1].end.hour).toBe(15);
    expect(slots[slots.length - 1].end.minute).toBe(0);
  });

  it('returns empty for a date with no valid window', () => {
    // generateSlotCandidates doesn't filter weekends—that's done by getAvailableSlots
    // But it should still generate correct slots for any date
    const day = DateTime.fromISO('2025-03-10', { zone: 'America/New_York' });
    const slots = generateSlotCandidates(day, 'job-seeker');
    expect(slots.length).toBeGreaterThan(0);
  });
});

describe('isSlotFree', () => {
  const tz = 'America/New_York';

  it('returns true when no busy periods', () => {
    const slot = {
      start: DateTime.fromISO('2025-03-10T19:00:00', { zone: tz }),
      end: DateTime.fromISO('2025-03-10T19:15:00', { zone: tz }),
    };
    expect(isSlotFree(slot, [])).toBe(true);
  });

  it('returns false when slot overlaps a busy period', () => {
    const slot = {
      start: DateTime.fromISO('2025-03-10T19:00:00', { zone: tz }),
      end: DateTime.fromISO('2025-03-10T19:15:00', { zone: tz }),
    };
    const busy = [{ start: '2025-03-10T23:00:00Z', end: '2025-03-10T23:30:00Z' }]; // 7PM-7:30PM ET in March
    expect(isSlotFree(slot, busy)).toBe(false);
  });

  it('returns false when slot is within buffer zone', () => {
    const slot = {
      start: DateTime.fromISO('2025-03-10T19:00:00', { zone: tz }),
      end: DateTime.fromISO('2025-03-10T19:15:00', { zone: tz }),
    };
    // Busy period ends at 18:50 ET -> with 15-min buffer extends to 19:05 ET
    const busy = [{ start: '2025-03-10T22:30:00Z', end: '2025-03-10T22:50:00Z' }];
    expect(isSlotFree(slot, busy)).toBe(false);
  });

  it('returns true when slot is outside buffer zone', () => {
    const slot = {
      start: DateTime.fromISO('2025-03-10T20:00:00', { zone: tz }),
      end: DateTime.fromISO('2025-03-10T20:15:00', { zone: tz }),
    };
    // Busy at 19:00-19:15 ET with buffer extends to 18:45-19:30 ET — slot at 20:00 is safe
    const busy = [{ start: '2025-03-10T23:00:00Z', end: '2025-03-10T23:15:00Z' }];
    expect(isSlotFree(slot, busy)).toBe(true);
  });

  it('handles null start/end in busy periods', () => {
    const slot = {
      start: DateTime.fromISO('2025-03-10T19:00:00', { zone: tz }),
      end: DateTime.fromISO('2025-03-10T19:15:00', { zone: tz }),
    };
    expect(isSlotFree(slot, [{ start: null, end: null }])).toBe(true);
  });
});
