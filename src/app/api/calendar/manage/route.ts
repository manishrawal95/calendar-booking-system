import { NextRequest, NextResponse } from 'next/server';
import { getCalendarEvent } from '@/lib/google-calendar';
import { verifyBookingManageToken } from '@/lib/booking-token';
import { extractMeetLink, extractType } from '@/lib/calendar-utils';

export async function GET(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) return NextResponse.json({ error: 'Calendar not configured' }, { status: 503 });

  const token = request.nextUrl.searchParams.get('token') ?? '';
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
    const start = event?.start?.dateTime ?? null;
    const end = event?.end?.dateTime ?? null;
    if (!start || !end) return NextResponse.json({ error: 'Event not found' }, { status: 404 });
    return NextResponse.json({
      start,
      end,
      meetLink: extractMeetLink(event),
      type: extractType(event),
    });
  } catch (e) {
    console.error('Manage fetch error:', e);
    return NextResponse.json({ error: 'Failed to load booking' }, { status: 500 });
  }
}

