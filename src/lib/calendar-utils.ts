import type { BookingType } from './google-calendar';

export function extractMeetLink(event: any): string | null {
  if (typeof event?.hangoutLink === 'string' && event.hangoutLink.length > 0) return event.hangoutLink;
  const entryPoints = event?.conferenceData?.entryPoints;
  if (Array.isArray(entryPoints)) {
    const meet = entryPoints.find((e: any) => e?.entryPointType === 'video' && typeof e?.uri === 'string');
    if (meet?.uri) return meet.uri;
  }
  return null;
}

export function extractType(event: any): BookingType | null {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/Booking type:\s*(.+)/i);
  if (!m) return null;
  const v = m[1].trim().toLowerCase();
  if (v.includes('job')) return 'job-seeker';
  if (v.includes('network')) return 'networking';
  return null;
}

export function extractGuestEmail(event: any): string | null {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/Email:\s*(\S+)/i);
  return m?.[1]?.trim() ?? null;
}

export function extractGuestTimezone(event: any): string {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/Guest timezone:\s*(.+)/i);
  return m?.[1]?.trim() ?? 'UTC';
}

export function extractGuestName(event: any): string {
  const summary = typeof event?.summary === 'string' ? event.summary : '';
  const m = summary.match(/15-min chat:\s*(.+?)\s*\(/i);
  return m?.[1]?.trim() ?? 'there';
}

export function extractAgenda(event: any): string {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/Agenda:\s*(.+)/i);
  return m?.[1]?.trim() ?? '';
}

export function extractLinkedinUrl(event: any): string | undefined {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/LinkedIn:\s*(\S+)/i);
  return m?.[1]?.trim() || undefined;
}

export function extractCompanyName(event: any): string | undefined {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/Company:\s*(.+)/i);
  return m?.[1]?.trim() || undefined;
}
