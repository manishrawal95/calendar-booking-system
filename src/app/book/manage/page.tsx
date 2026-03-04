'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { CalendarClock, Check, Loader2, ShieldCheck, XCircle } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { DateTime } from 'luxon';

type Slot = { start: string; end: string };

const OWNER_TIMEZONE = process.env.NEXT_PUBLIC_BOOKING_TIMEZONE ?? 'America/New_York';
const DAYS_AHEAD = 14;

function getOwnerDateStrings(): string[] {
  const base = DateTime.now().setZone(OWNER_TIMEZONE).startOf('day');
  const dates: string[] = [];
  let i = 0;
  while (dates.length < DAYS_AHEAD) {
    const day = base.plus({ days: i });
    if (day.weekday < 6) dates.push(day.toISODate()!); // Mon-Fri only
    i++;
  }
  return dates;
}

function formatOwnerDate(dateStr: string): string {
  const d = DateTime.fromISO(dateStr, { zone: OWNER_TIMEZONE }).set({ hour: 12 });
  return d.toJSDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function ManageBookingPage() {
  const params = useMemo(() => new URLSearchParams(typeof window !== 'undefined' ? window.location.search : ''), []);
  const token = params.get('token') ?? '';

  const clientTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);
  const dates = useMemo(getOwnerDateStrings, []);

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [event, setEvent] = useState<{ start: string; end: string; meetLink: string | null } | null>(null);
  const [type, setType] = useState<'job-seeker' | 'networking' | null>(null);

  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(null);
  const [saving, setSaving] = useState(false);
  const [cancelling, setCancelling] = useState(false);
  const [notice, setNotice] = useState<{ kind: 'success' | 'info'; message: string } | null>(null);
  const [cancelled, setCancelled] = useState(false);
  const [confirmingCancel, setConfirmingCancel] = useState(false);

  const abortRef = useRef<AbortController | null>(null);

  useEffect(() => {
    const run = async () => {
      if (!token) {
        setError('Missing token.');
        setLoading(false);
        return;
      }
      try {
        const res = await fetch(`/api/calendar/manage?token=${encodeURIComponent(token)}`);
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Failed to load booking');
        setEvent({ start: data.start, end: data.end, meetLink: data.meetLink ?? null });
        setType(data.type ?? null);
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load booking');
      } finally {
        setLoading(false);
      }
    };
    run();
  }, [token]);

  const formatLocal = (iso: string) =>
    new Date(iso).toLocaleString('en-US', { weekday: 'short', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true });

  const fetchSlots = async (dateStr: string) => {
    if (!token) return;
    setLoadingSlots(true);
    setError('');
    setNotice(null);
    setSelectedSlot(null);
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;
      const res = await fetch(`/api/calendar/manage/availability?token=${encodeURIComponent(token)}&date=${dateStr}`, { signal: ac.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load slots');
      setSlots(data.slots ?? []);
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Failed to load slots');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const reschedule = async () => {
    if (!selectedSlot || !token) return;
    setSaving(true);
    setError('');
    setNotice(null);
    try {
      const res = await fetch('/api/calendar/reschedule', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, start: selectedSlot.start, end: selectedSlot.end, clientTimeZone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Reschedule failed');
      setEvent({ start: data.start, end: data.end, meetLink: data.meetLink ?? null });
      setSelectedDate(null);
      setSlots([]);
      setSelectedSlot(null);
      const newTime = formatLocal(data.start);
      setNotice({ kind: 'success', message: `Rescheduled to ${newTime}. Check your email for the updated confirmation.` });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Reschedule failed');
    } finally {
      setSaving(false);
    }
  };

  const cancel = async () => {
    if (!token) return;
    setCancelling(true);
    setError('');
    setNotice(null);
    try {
      const res = await fetch('/api/calendar/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, clientTimeZone }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Cancel failed');
      setEvent(null);
      setCancelled(true);
      setNotice({ kind: 'info', message: 'Cancelled. A confirmation email has been sent.' });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Cancel failed');
    } finally {
      setCancelling(false);
    }
  };

  return (
    <div className="mt-6 flex flex-col items-center justify-center relative overflow-hidden py-10 sm:py-20">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-lg mx-auto px-4 w-full z-10">
        <BackButton />

        <div className="p-6 md:p-8 bg-background/95 backdrop-blur-md border border-foreground/10 rounded-2xl shadow-xl">
          <div className="flex items-center gap-3 mb-6">
            <div className="relative flex items-center justify-center p-3 rounded-full bg-background/80 backdrop-blur-sm border border-foreground/10">
              <CalendarClock className="w-5 h-5 text-foreground" />
            </div>
            <div>
              <h1 className="text-xl md:text-2xl font-bold text-foreground">Manage booking</h1>
              <p className="text-foreground/60 text-xs">Timezone: {clientTimeZone}</p>
            </div>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-10 text-foreground/60">
              <Loader2 className="w-6 h-6 animate-spin" />
            </div>
          ) : !event ? (
            <div className="text-sm text-foreground/70">
              {cancelled ? 'Your booking is cancelled.' : 'This booking is no longer active (it may have been cancelled).'}
              <div className="mt-4">
                <Link
                  href="/book"
                  className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-primary text-white font-medium hover:bg-primary/90 transition-colors"
                >
                  Book again
                </Link>
              </div>
            </div>
          ) : (
            <>
              {notice && (
                <div
                  className={`mb-5 rounded-xl border px-4 py-3 text-sm ${
                    notice.kind === 'success'
                      ? 'border-green-500/20 bg-green-500/10 text-foreground'
                      : 'border-foreground/10 bg-background/50 text-foreground'
                  }`}
                  role="status"
                >
                  <div className="flex items-start gap-3">
                    <div className={`mt-0.5 ${notice.kind === 'success' ? 'text-green-600' : 'text-primary'}`}>
                      {notice.kind === 'success' ? <Check className="w-4 h-4" /> : <ShieldCheck className="w-4 h-4" />}
                    </div>
                    <div className="text-foreground/80">{notice.message}</div>
                  </div>
                </div>
              )}
              <div className="p-4 rounded-xl border border-foreground/10 bg-background/50 mb-6">
                <div className="text-xs text-foreground/50">Current time</div>
                <div className="text-sm font-semibold text-foreground mt-1">
                  {formatLocal(event.start)} – {new Date(event.end).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                </div>
                {event.meetLink && (
                  <a
                    href={event.meetLink}
                    className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-primary hover:underline"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ShieldCheck className="w-4 h-4" />
                    Join call
                  </a>
                )}
              </div>

              <div className="text-sm text-foreground/70 mb-3">Pick a new date and time</div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-44 overflow-y-auto">
                {dates.map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => {
                      setSelectedDate(d);
                      fetchSlots(d);
                    }}
                    className={`py-2.5 px-3 rounded-lg border text-sm font-medium transition-all ${
                      selectedDate === d
                        ? 'border-primary bg-primary text-white'
                        : 'border-foreground/10 hover:border-foreground/20 text-foreground'
                    }`}
                  >
                    {formatOwnerDate(d)}
                  </button>
                ))}
              </div>

              {selectedDate && (
                <div className="mt-6">
                  <p className="text-foreground/70 text-sm mb-3">Available times on {formatOwnerDate(selectedDate)}</p>
                  {loadingSlots ? (
                    <div className="flex items-center justify-center py-8 text-foreground/60">
                      <Loader2 className="w-6 h-6 animate-spin" />
                    </div>
                  ) : slots.length === 0 ? (
                    <p className="text-sm text-foreground/60 py-2">No slots that day. Try another date.</p>
                  ) : (
                    <div className="grid grid-cols-3 gap-2">
                      {slots.map((slot) => (
                        <button
                          key={slot.start}
                          type="button"
                          onClick={() => setSelectedSlot(slot)}
                          className={`py-2 px-3 rounded-lg border text-sm font-medium transition-all ${
                            selectedSlot?.start === slot.start
                              ? 'border-primary bg-primary text-white'
                              : 'border-foreground/10 hover:border-primary/30 text-foreground'
                          }`}
                        >
                          {new Date(slot.start).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true })}
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}

              {error && (
                <p className="mt-4 text-sm text-red-600" role="alert">
                  {error}
                </p>
              )}

              <div className="mt-6 pt-6 border-t border-foreground/10 flex flex-col gap-3">
                <button
                  type="button"
                  disabled={!selectedSlot || saving}
                  onClick={reschedule}
                  className="mt-6 w-full py-3 rounded-full border border-primary text-primary font-medium hover:bg-primary/20 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
                >
                  {saving ? <Loader2 className="w-5 h-5 animate-spin" /> : null}
                  Reschedule
                </button>
                {!confirmingCancel ? (
                  <button
                    type="button"
                    disabled={cancelling}
                    onClick={() => setConfirmingCancel(true)}
                    className="w-full py-3 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                  >
                    Cancel booking
                  </button>
                ) : (
                  <div className="p-4 rounded-xl border border-red-500/20 bg-red-500/5">
                    <p className="text-sm text-foreground mb-3">Are you sure you want to cancel this booking?</p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={cancel}
                        className="flex-1 py-2.5 rounded-full bg-red-500/10 hover:bg-red-500/20 text-red-600 font-medium transition-colors disabled:opacity-50 flex items-center justify-center gap-2"
                      >
                        {cancelling ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                        Yes, cancel
                      </button>
                      <button
                        type="button"
                        disabled={cancelling}
                        onClick={() => setConfirmingCancel(false)}
                        className="flex-1 py-2.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground font-medium transition-colors disabled:opacity-50"
                      >
                        Keep booking
                      </button>
                    </div>
                  </div>
                )}
              </div>

              <div className="mt-4 text-xs text-foreground/50">
                Note: Changes may not be allowed within 12 hours of the meeting.
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

