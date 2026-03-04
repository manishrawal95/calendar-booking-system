import { describe, it, expect } from 'vitest';
import {
  extractMeetLink,
  extractType,
  extractGuestEmail,
  extractGuestTimezone,
  extractGuestName,
  extractAgenda,
} from '../calendar-utils';

describe('extractMeetLink', () => {
  it('returns hangoutLink when present', () => {
    expect(extractMeetLink({ hangoutLink: 'https://meet.google.com/abc' })).toBe('https://meet.google.com/abc');
  });

  it('returns video entryPoint URI when no hangoutLink', () => {
    const event = {
      conferenceData: {
        entryPoints: [
          { entryPointType: 'phone', uri: 'tel:+1234' },
          { entryPointType: 'video', uri: 'https://meet.google.com/xyz' },
        ],
      },
    };
    expect(extractMeetLink(event)).toBe('https://meet.google.com/xyz');
  });

  it('returns null when no conference data', () => {
    expect(extractMeetLink({})).toBeNull();
    expect(extractMeetLink(null)).toBeNull();
    expect(extractMeetLink(undefined)).toBeNull();
  });

  it('returns null for empty hangoutLink', () => {
    expect(extractMeetLink({ hangoutLink: '' })).toBeNull();
  });
});

describe('extractType', () => {
  it('returns job-seeker', () => {
    expect(extractType({ description: 'Booking type: Job Seeker\nOther stuff' })).toBe('job-seeker');
  });

  it('returns networking', () => {
    expect(extractType({ description: 'Booking type: Peer Networking' })).toBe('networking');
  });

  it('returns null for missing description', () => {
    expect(extractType({})).toBeNull();
    expect(extractType({ description: 'No booking info' })).toBeNull();
  });
});

describe('extractGuestEmail', () => {
  it('extracts email from description', () => {
    expect(extractGuestEmail({ description: 'Name: Test\nEmail: test@example.com\nAgenda: stuff' })).toBe('test@example.com');
  });

  it('returns null if no email line', () => {
    expect(extractGuestEmail({ description: 'Name: Test' })).toBeNull();
    expect(extractGuestEmail({})).toBeNull();
  });
});

describe('extractGuestTimezone', () => {
  it('extracts timezone from description', () => {
    expect(extractGuestTimezone({ description: 'Guest timezone: America/Chicago' })).toBe('America/Chicago');
  });

  it('defaults to UTC', () => {
    expect(extractGuestTimezone({})).toBe('UTC');
  });
});

describe('extractGuestName', () => {
  it('extracts name from summary', () => {
    expect(extractGuestName({ summary: '15-min chat: John Doe (Job Seeker)' })).toBe('John Doe');
  });

  it('defaults to "there"', () => {
    expect(extractGuestName({})).toBe('there');
    expect(extractGuestName({ summary: 'Some other event' })).toBe('there');
  });
});

describe('extractAgenda', () => {
  it('extracts agenda from description', () => {
    expect(extractAgenda({ description: 'Booking type: Job Seeker\nAgenda: Want to discuss career goals' })).toBe('Want to discuss career goals');
  });

  it('returns empty string if missing', () => {
    expect(extractAgenda({})).toBe('');
  });
});
