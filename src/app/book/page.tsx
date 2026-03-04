'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { motion, AnimatePresence } from 'framer-motion';
import { Calendar, ArrowLeft, Briefcase, Users, Loader2, Check } from 'lucide-react';
import { BackButton } from '@/components/ui/BackButton';
import { DateTime } from 'luxon';
import { isValidName, isValidAgenda, isValidLinkedinUrl } from '@/lib/validation-client';

// Lightweight client-side email format check (full validation with domain lists happens server-side)
const isValidEmailFormat = (email: string) => {
  const trimmed = email.trim().toLowerCase();
  const re = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!re.test(trimmed)) return false;
  const [localPart, domain] = trimmed.split('@');
  if (!localPart || !domain) return false;
  if (localPart.length < 3 || domain.length < 5) return false;
  if (!/[a-zA-Z]/.test(localPart)) return false;
  return true;
};

// Quick heuristic for common free email providers (client-side hint only)
const FREE_EMAIL_HINTS = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com', 'mail.com', 'protonmail.com'];
const isCompanyEmail = (email: string) => {
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return false;
  return !FREE_EMAIL_HINTS.includes(domain);
};

type BookingType = 'job-seeker' | 'networking';

const OWNER_TIMEZONE = process.env.NEXT_PUBLIC_BOOKING_TIMEZONE ?? 'America/New_York';

const BOOKING_TYPES: { id: BookingType; label: string; description: string; hint?: string; icon: React.ReactNode; guardrail?: string }[] = [
  { 
    id: 'job-seeker', 
    label: 'Job Search Support', 
    description: 'Resume, interviews, career pivots, or search strategy.', 
    icon: <Briefcase className="w-5 h-5 text-foreground group-hover:text-blue-500 transition-colors duration-300" />
  },
  { 
    id: 'networking', 
    label: 'Peer Networking', 
    description: 'Swap ideas, share experiences, or just connect as peers.',
    hint: 'Work email required.',
    icon: <Users className="w-5 h-5 text-foreground group-hover:text-purple-500 transition-colors duration-300" />,
    guardrail: 'I confirm this is not for job referrals, resume review, or job search advice. I understand bookings made for those purposes may be cancelled.'
  },
];

const DAYS_AHEAD = 14;

function getDateStrings(): string[] {
  const base = DateTime.now().setZone(OWNER_TIMEZONE).startOf('day');
  const dates: string[] = [];

  let addedDays = 0;
  let i = 0;
  while (addedDays < DAYS_AHEAD) {
    const day = base.plus({ days: i });
    const weekday = day.weekday; // 1 = Monday, 7 = Sunday
    if (weekday < 6) { // Monday to Friday only
      dates.push(day.toISODate()!);
      addedDays++;
    }
    i++;
  }

  return dates;
}

function formatDate(dateStr: string): string {
  const d = DateTime.fromISO(dateStr, { zone: OWNER_TIMEZONE }).set({ hour: 12 });
  return d.toJSDate().toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

export default function BookPage() {
  const [step, setStep] = useState(1);
  const [bookingType, setBookingType] = useState<BookingType | null>(null);
  const [networkingGuardrailOk, setNetworkingGuardrailOk] = useState(false);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [slots, setSlots] = useState<{ start: string; end: string }[]>([]);
  const [loadingSlots, setLoadingSlots] = useState(false);
  const [selectedSlot, setSelectedSlot] = useState<{ start: string; end: string } | null>(null);
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [linkedinUrl, setLinkedinUrl] = useState('');
  const [companyName, setCompanyName] = useState('');
  const [agenda, setAgenda] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [booked, setBooked] = useState(false);
  const [error, setError] = useState('');
  const [manageUrl, setManageUrl] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);

  const dates = useMemo(getDateStrings, []);
  const clientTimeZone = useMemo(() => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC', []);

  useEffect(() => {
    return () => {
      abortRef.current?.abort();
    };
  }, []);

  const fetchSlots = async (date: string) => {
    if (!bookingType) return;
    setLoadingSlots(true);
    setError('');
    try {
      abortRef.current?.abort();
      const ac = new AbortController();
      abortRef.current = ac;

      const res = await fetch(`/api/calendar/availability?type=${bookingType}&date=${date}`, { signal: ac.signal });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to load slots');
      setSlots(data.slots ?? []);
    } catch (e) {
      if ((e as any)?.name === 'AbortError') return;
      setError(e instanceof Error ? e.message : 'Could not load availability');
      setSlots([]);
    } finally {
      setLoadingSlots(false);
    }
  };

  const onSelectDate = (date: string) => {
    setSelectedDate(date);
    setSelectedSlot(null);
    fetchSlots(date);
  };

  const handleBook = async (e: React.FormEvent) => {
    e.preventDefault();
  
    if (!bookingType || !selectedSlot) return;
  
    if (!isValidName(name)) {
      setError('Please enter a valid name.');
      return;
    }
  
   if (!isValidEmailFormat(email)) {
    setError('Please enter a valid email address.');
    return;
  }

    if (!isValidLinkedinUrl(linkedinUrl)) {
      setError('Please enter a valid LinkedIn profile URL (e.g. https://linkedin.com/in/yourname).');
      return;
    }

    if (bookingType === 'networking' && !companyName.trim()) {
      setError('Company name is required for peer networking.');
      return;
    }

    if (!isValidAgenda(agenda)) {
      setError('Please enter a meaningful agenda.');
      return;
    }
  
    setSubmitting(true);
    setError('');
  
    try {
      const res = await fetch('/api/calendar/book', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: bookingType,
          start: selectedSlot.start,
          end: selectedSlot.end,
          name: name.trim(),
          email: email.trim(),
          linkedinUrl: linkedinUrl.trim(),
          companyName: bookingType === 'networking' ? companyName.trim() : undefined,
          agenda: agenda.trim(),
          clientTimeZone,
          networkingGuardrailOk: bookingType === 'networking' ? networkingGuardrailOk : undefined,
        }),
      });
  
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Booking failed');
  
      setManageUrl(data.manageUrl ?? null);
      setBooked(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setSubmitting(false);
    }
  };

  const formatSlotTime = (iso: string) => {
    return new Date(iso).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
  };

  return (
    <div className="flex flex-col items-center justify-center relative overflow-hidden py-6 sm:py-12">
      <div className="absolute inset-0 -z-10">
        <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/10 rounded-full blur-3xl" />
        <div className="absolute bottom-1/4 right-1/4 w-72 h-72 bg-purple-500/10 rounded-full blur-3xl" />
      </div>

      <div className="max-w-lg mx-auto px-4 w-full z-10">
        <BackButton />

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1 }}
          className="flex items-center gap-3 mb-8"
        >
<div className="relative flex items-center justify-center p-3 rounded-full bg-background/80 backdrop-blur-sm border border-foreground/10">
  <Calendar className="w-5 h-5 text-foreground" />
</div>
          <div>
            <h1 className="text-2xl md:text-3xl font-bold bg-gradient-to-r from-primary via-purple-500 to-primary bg-clip-text text-transparent">
              Book a Chat
            </h1>
            <p className="text-foreground text-sm mt-0.5">15-min intro call</p>
          </div>
        </motion.div>

        <AnimatePresence mode="wait">
          {booked ? (
            <motion.div
              key="done"
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0 }}
              className="p-6 md:p-8 bg-background/95 backdrop-blur-md border border-foreground/10 rounded-2xl shadow-xl text-center"
            >
              <div className="w-14 h-14 rounded-full bg-green-500/20 flex items-center justify-center mx-auto mb-4">
                <Check className="w-7 h-7 text-green-600" />
              </div>
              <h2 className="text-xl font-semibold text-foreground mb-2">You&apos;re all set</h2>
              <p className="text-foreground/70 text-sm mb-6">
                Check your email for the confirmation (and a reschedule link). See you then!
              </p>
              <div className="flex flex-col items-center gap-3">
                {manageUrl && (
                  <a
                    href={manageUrl}
                    className="inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-full bg-foreground/5 hover:bg-foreground/10 text-foreground font-medium transition-colors"
                  >
                    Manage booking
                  </a>
                )}
           
              </div>
            </motion.div>
          ) : (
            <motion.div
              key="form"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="p-6 md:p-8 bg-background/95 backdrop-blur-md border border-foreground/10 rounded-2xl shadow-xl"
            >
              {/* Step indicator */}
              <div className="flex items-center gap-2 mb-6">
                {[1, 2, 3].map((s) => (
                  <React.Fragment key={s}>
                    <div className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold transition-all ${
                      step >= s ? 'bg-primary text-white' : 'bg-foreground/10 text-foreground/40'
                    }`}>{s}</div>
                    {s < 3 && <div className={`flex-1 h-0.5 transition-all ${step > s ? 'bg-primary' : 'bg-foreground/10'}`} />}
                  </React.Fragment>
                ))}
              </div>

              {step === 1 && (
                <>
                  <p className="text-foreground/70 text-sm mb-4 flex items-center gap-2">
                    What would you like to chat about?
                  </p>
                  <div className="grid gap-3">
                    {BOOKING_TYPES.map((opt) => (
                      <motion.button
                        key={opt.id}
                        type="button"
                        onClick={() => {
                          setBookingType(opt.id);
                          setNetworkingGuardrailOk(false);
                          setStep(opt.id === 'networking' ? 1 : 2);
                          setSelectedDate(null);
                          setSlots([]);
                          setSelectedSlot(null);
                        }}
                        className="group flex items-center gap-4 p-4 rounded-2xl bg-white/70 backdrop-blur-sm shadow-sm hover:shadow-md transition-all text-left border border-transparent hover:border-primary/20"
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.99 }}
                      >
                        <div className="group/icon relative flex items-center justify-center p-3 rounded-full bg-background/80 backdrop-blur-sm border border-foreground/10">
                          {opt.icon}
                          <div className={`absolute inset-0 rounded-full opacity-0 group-hover:opacity-100 -z-10 transition-opacity duration-300 ${
                            opt.id === 'job-seeker' ? 'bg-gradient-to-r from-blue-500/20 to-blue-600/20' : 'bg-gradient-to-r from-purple-500/20 to-purple-600/20'
                          }`} />
                        </div>
                        <div>
                          <div className="font-semibold text-foreground">{opt.label}</div>
                          <div className="text-xs text-foreground/70 mt-0.5">
                            {opt.description}{opt.hint && <> <span className="font-semibold text-foreground/90">{opt.hint}</span></>}
                          </div>
                        </div>
                      </motion.button>
                    ))}
                  </div>
                  {bookingType === 'networking' && (
                    <div className="mt-4 p-4 rounded-2xl bg-white/70 backdrop-blur-sm">
                      <label className="flex items-start gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          className="mt-1 h-4 w-4"
                          checked={networkingGuardrailOk}
                          onChange={(e) => setNetworkingGuardrailOk(e.target.checked)}
                        />
                        <span className="text-sm text-foreground/70">
                          <span className="font-semibold text-foreground">Please Confirm:</span>{' '}
                          {BOOKING_TYPES.find((x) => x.id === 'networking')?.guardrail}
                        </span>
                      </label>
                      <button
                        type="button"
                        disabled={!networkingGuardrailOk}
                        onClick={() => setStep(2)}
                        className="mt-4 w-full py-3 rounded-full  border border-primary text-primary font-medium hover:bg-primary/20 transition-colors"
                                                

                      >
                        Continue
                      </button>
                    </div>
                  )}
                </>
              )}

              {step === 2 && bookingType && (bookingType !== 'networking' || networkingGuardrailOk) && (
                <>
                  <button
  type="button"
  onClick={() => setStep(1)}
  className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground transition-colors mb-4"
>
  <ArrowLeft className="w-4 h-4 flex-shrink-0" />
  <span>Change booking type</span>
</button>
                  <p className="text-foreground/70 text-sm mb-4">Choose a date</p>
                  <p className="text-foreground/60 text-xs mb-3">Timezone: {clientTimeZone}</p>
                  <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto">
                    {dates.map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => onSelectDate(d)}
                        className={`py-2.5 px-3 rounded-xl border text-sm font-medium transition-all ${
                          selectedDate === d
                            ? 'border-primary bg-primary text-white'
                            : 'border-foreground/10 hover:border-foreground/20 text-foreground'
                        }`}
                      >
                        {formatDate(d)}
                      </button>
                    ))}
                  </div>
                  {selectedDate && (
                    <div className="mt-6">
                      <p className="text-foreground/70 text-sm mb-3">Available times on {formatDate(selectedDate)}</p>
                      {loadingSlots ? (
                        <div className="flex items-center justify-center gap-2 py-8 text-foreground/60">
                          <Loader2 className="w-5 h-5 animate-spin" />
                          <span className="text-sm">Loading available times...</span>
                        </div>
                      ) : slots.length === 0 ? (
                        <p className="text-sm text-foreground/60 py-4">No slots available this day. Try another date.</p>
                      ) : (
                        <div className="grid grid-cols-3 gap-2">
                          {slots.map((slot) => (
                            <button
                              key={slot.start}
                              type="button"
                              onClick={() => setSelectedSlot(slot)}
                              className={`py-2 px-3 rounded-xl border text-sm font-medium transition-all ${
                                selectedSlot?.start === slot.start
                                  ? 'border-primary bg-primary text-white'
                                  : 'border-foreground/10 hover:border-primary/30 text-foreground'
                              }`}
                            >
                              {formatSlotTime(slot.start)}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                  {selectedSlot && (
                    <div className="mt-6 pt-6 border-t border-foreground/10">
                      <button
                        type="button"
                        onClick={() => setStep(3)}
                        className="w-full py-3 rounded-full  border border-primary text-primary font-medium hover:bg-primary/20 transition-colors"

                      >
                        Continue with {formatSlotTime(selectedSlot.start)}
                      </button>
                    </div>
                  )}
                  <p className="mt-6 text-xs text-foreground/80 text-center">
                    Don&apos;t see a date &amp; time that works? <a href="https://linkedin.com/in/rawalmanish" target="_blank" rel="noreferrer" className="text-foreground/70 underline hover:text-foreground transition-colors">Message on LinkedIn</a>
                  </p>
                </>
              )}

              {step === 3 && bookingType && selectedSlot && (
                <form onSubmit={handleBook}>
                 <button
  type="button"
  onClick={() => setStep(2)}
  className="inline-flex items-center gap-2 text-sm text-foreground/60 hover:text-foreground transition-colors mb-4"
>
  <ArrowLeft className="w-4 h-4 flex-shrink-0" />
  <span>Change time</span>
</button>
                  <p className="text-foreground font-medium text-sm mb-2">
                    {formatDate(selectedDate!)}, {formatSlotTime(selectedSlot.start)}
                  </p>
                  <p className="text-foreground/60 text-xs mb-4">Timezone: {clientTimeZone}</p>
                  <div className="space-y-4">
                    <div>
                      <label htmlFor="name" className="block text-sm font-medium text-foreground/80 mb-1.5">
                      Name <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="name"
                        type="text"
                        required
                        value={name}
                        onChange={(e) => setName(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg border border-foreground/10 bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        placeholder="Your name"
                      />
                    </div>
                    <div>
                      <label htmlFor="email" className="block text-sm font-medium text-foreground/80 mb-1.5">
                        Email <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="email"
                        type="email"
                        required
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg border border-foreground/10 bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        placeholder="you@example.com"
                      />
                      {bookingType === 'networking' && !isCompanyEmail(email) && email.length > 3 && (
                        <p className="mt-1 text-xs text-red-500">
                          Peer networking requires a valid work email.
                        </p>
                      )}
                    </div>
                    <div>
                      <label htmlFor="linkedinUrl" className="block text-sm font-medium text-foreground/80 mb-1.5">
                      LinkedIn Profile URL <span className="text-red-500">*</span>
                      </label>
                      <input
                        id="linkedinUrl"
                        type="url"
                        required
                        value={linkedinUrl}
                        onChange={(e) => setLinkedinUrl(e.target.value)}
                        className="w-full px-4 py-2.5 rounded-lg border border-foreground/10 bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                        placeholder="https://linkedin.com/in/yourname"
                      />
                      {linkedinUrl.length > 5 && !isValidLinkedinUrl(linkedinUrl) && (
                        <p className="mt-1 text-xs text-red-500">
                          Please enter a valid LinkedIn URL (e.g. https://linkedin.com/in/yourname).
                        </p>
                      )}
                    </div>
                    {bookingType === 'networking' && (
                      <div>
                        <label htmlFor="companyName" className="block text-sm font-medium text-foreground/80 mb-1.5">
                        Company Name <span className="text-red-500">*</span>
                        </label>
                        <input
                          id="companyName"
                          type="text"
                          required
                          value={companyName}
                          onChange={(e) => setCompanyName(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-foreground/10 bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary"
                          placeholder="Your company name"
                        />
                      </div>
                    )}
                    <div>
                      <label htmlFor="agenda" className="block text-sm font-medium text-foreground/80 mb-1.5">
                      What should we talk about? <span className="text-red-500">*</span>
                      </label>
                      <div>
                        <textarea
                          id="agenda"
                          required
                          value={agenda}
                          onChange={(e) => setAgenda(e.target.value)}
                          className="w-full px-4 py-2.5 rounded-lg border border-foreground/10 bg-background text-foreground placeholder:text-foreground/40 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary min-h-[96px]"
                          placeholder="Share 1–2 lines about what you'd like to discuss or get feedback on."
                          maxLength={500}
                        />
                      </div>
                      <p className="mt-1 text-xs text-foreground/50">{agenda.length}/500</p>
                    </div>
                  </div>
                  {error && (
                    <p className="mt-3 text-sm text-red-600" role="alert">
                      {error}
                    </p>
                  )}
                 <button
  type="submit"
  disabled={
    submitting || (bookingType === 'networking' && !isCompanyEmail(email)) || !isValidLinkedinUrl(linkedinUrl) || (bookingType === 'networking' && !companyName.trim())
  }
  className="mt-6 w-full py-3 rounded-full border border-primary text-primary font-medium hover:bg-primary/20 transition-colors disabled:opacity-70 flex items-center justify-center gap-2"
>
  {submitting ? (
    <>
      <Loader2 className="w-5 h-5 animate-spin" />
      Booking…
    </>
  ) : (
    'Confirm booking'
  )}
</button>
                </form>
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
