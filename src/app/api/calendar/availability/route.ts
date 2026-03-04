import { NextRequest, NextResponse } from 'next/server';
import { getAvailableSlots } from '@/lib/google-calendar';
import type { BookingType } from '@/lib/google-calendar';

export async function GET(request: NextRequest) {
  const calendarId = process.env.GOOGLE_CALENDAR_ID;
  if (!calendarId) {
    return NextResponse.json({ error: 'Calendar not configured' }, { status: 503 });
  }
  const type = request.nextUrl.searchParams.get('type') as BookingType | null;
  const date = request.nextUrl.searchParams.get('date');
  if (!type || !date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: 'Missing or invalid type or date (YYYY-MM-DD)' }, { status: 400 });
  }
  if (type !== 'job-seeker' && type !== 'networking') {
    return NextResponse.json({ error: 'Invalid type' }, { status: 400 });
  }
  try {
    const slots = await getAvailableSlots(calendarId, date, type);
    return NextResponse.json({ slots });
  } catch (e) {
    console.error('Availability error:', e);
    return NextResponse.json({ error: 'Failed to fetch availability' }, { status: 500 });
  }
}
