import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots, getCalendarEvent } from '@/lib/google-calendar';
import { verifyBookingManageToken } from '@/lib/booking-token';
import type { BookingType } from '@/lib/google-calendar';

function extractType(event: any): BookingType | null {
  const desc = typeof event?.description === 'string' ? event.description : '';
  const m = desc.match(/Booking type:\s*(.+)/i);
  if (!m) return null;
  const v = m[1].trim().toLowerCase();
  if (v.includes('job')) return 'job-seeker';
  if (v.includes('network')) return 'networking';
  return null;
}

export async function GET(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) return NextResponse.json({ error: 'Calendar not configured' }, { status: 503 });

  const token = request.nextUrl.searchParams.get('token') ?? '';
  const date = request.nextUrl.searchParams.get('date');
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Missing or invalid date (YYYY-MM-DD)' }, { status: 400 });
  }

  let verified: ReturnType<typeof verifyBookingManageToken>;
  try {
    verified = verifyBookingManageToken(token);
  } catch (e) {
    console.error('Token verify error:', e);
    return NextResponse.json({ error: 'Booking links not configured' }, { status: 503 });
  }
  if (!verified.ok) return NextResponse.json({ error: verified.reason }, { status: 401 });

  try {
    const event = await getCalendarEvent(calendarId, verified.payload.eventId);
    const type = extractType(event);
    if (!type) return NextResponse.json({ error: 'Could not determine booking type' }, { status: 400 });
    const slots = await getAvailableSlots(calendarId, date, type, { ignoreEventId: verified.payload.eventId });
    return NextResponse.json({ slots });
  } catch (e) {
    console.error('Manage availability error:', e);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}

