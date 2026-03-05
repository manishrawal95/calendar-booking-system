# justbook

> **Open-source scheduling that just works. No account. No paywall. No subscription.**
> Set your availability. Share your link. Let people book time with you — with automatic Google Meet, email reminders, and rescheduling built in.

[Live Demo →](https://mrawal.com/book)

---

## What It Does

You share a link. Someone picks a time. You both get a calendar invite with a Google Meet link, a confirmation email, and automatic reminders before the meeting.

If they need to reschedule or cancel, they can do that too — no account required, no back-and-forth emails.

That's it.

---

## Why Not Just Use Calendly?

Calendly's free tier locks the features people actually use behind a $20/month paywall.

| Feature | Calendly Free | Calendly Standard ($20/mo) | justbook |
|---|---|---|---|
| Google Calendar sync | ✅ | ✅ | ✅ |
| Google Meet auto-link | ❌ | ✅ | ✅ |
| Email confirmations | ✅ | ✅ | ✅ |
| 24h + 1h reminders | ❌ | ✅ | ✅ |
| Rescheduling flow | ❌ | ✅ | ✅ |
| Cancellation flow | ❌ | ✅ | ✅ |
| ICS calendar attachment | ❌ | ✅ | ✅ |
| Disposable email blocking | ❌ | ❌ | ✅ |
| No-login manage links | ❌ | ❌ | ✅ |
| You own your data | ❌ | ❌ | ✅ |
| Monthly cost | $0 | $20 | **$0 forever** |

---

## Everything Included

**Booking**
- Two meeting types — 30-minute deep dive and 15-minute quick chat
- Smart slot generation with buffer time and conflict detection
- Blocks disposable email addresses at input

**Calendar**
- Creates Google Calendar events automatically
- Attaches a Google Meet link to every booking
- Downloads an `.ics` file so guests can add it to any calendar app

**Emails**
- Confirmation email sent immediately on booking
- Reminder emails 24 hours and 1 hour before the meeting
- Cancellation email if the meeting is cancelled — reminders auto-cancelled too

**Rescheduling & Cancellation**
- Every confirmation email includes a secure manage link
- Guests reschedule or cancel without creating an account
- Links are HMAC-signed — tamper-proof, no auth system needed

**Reliability**
- 62 tests covering slot generation, validation, reminders, and availability
- Timezone-aware scheduling using Luxon
- Full conflict detection via Google Calendar freebusy API

---

## How It Works

```
Guest picks a time → Booking confirmed
                          ├→ Google Calendar event created (+ Meet link)
                          ├→ Confirmation email sent (with ICS attachment)
                          └→ Reminders scheduled (24h + 1h before)

Guest clicks manage link → Verified via HMAC token
                          ├→ Reschedule → new time, updated calendar event, new emails
                          └→ Cancel → event deleted, cancellation email, reminders cancelled
```

---

## Tech Stack

- **Next.js 14** (App Router)
- **TypeScript**
- **Google Calendar API**
- **Resend** (transactional email + reminder scheduling)
- **Luxon** (timezone-aware date handling)
- **Vitest** (62 tests)

---

## Self-Host in 15 Minutes

### Prerequisites

- Node.js 18+
- Google Cloud project with Calendar API enabled
- Google service account with calendar access
- Free [Resend](https://resend.com) account

### 1. Clone & Install

```bash
git clone https://github.com/yourusername/justbook.git
cd justbook
npm install
```

### 2. Set Environment Variables

```env
# Google Calendar
GOOGLE_SERVICE_ACCOUNT_EMAIL=your-service-account@project.iam.gserviceaccount.com
GOOGLE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
GOOGLE_CALENDAR_ID=your-calendar@gmail.com
GOOGLE_CALENDAR_TIMEZONE=America/New_York
GOOGLE_OAUTH_CLIENT_ID=
GOOGLE_OAUTH_CLIENT_SECRET=
GOOGLE_OAUTH_REDIRECT_URI=
GOOGLE_OAUTH_REFRESH_TOKEN=

# Resend
RESEND_API_KEY=re_...
RESEND_FROM_EMAIL=Bookings <bookings@yourdomain.com>

# Booking
BOOKING_ADMIN_EMAIL=you@example.com
BOOKING_SIGNING_SECRET=your-random-hex-string
NEXT_PUBLIC_BOOKING_TIMEZONE=America/New_York
```

### 3. Run

```bash
npm run dev
```

### 4. Test

```bash
npm test
```

---

## Project Structure

```
src/
├── lib/
│   ├── google-calendar.ts    # Slot generation, availability, event CRUD
│   ├── google-auth.ts        # Google OAuth + service account auth
│   ├── booking-email.ts      # HTML/text email templates
│   ├── schedule-reminders.ts # Resend scheduled reminders (24h + 1h)
│   ├── booking-ics.ts        # ICS calendar file generation
│   ├── booking-token.ts      # HMAC token generation/verification
│   ├── calendar-utils.ts     # Helpers for extracting calendar event data
│   ├── validation.ts         # Server-side email validation (disposable domain checks)
│   ├── validation-client.ts  # Client-safe validation (name, agenda, LinkedIn URL)
│   └── __tests__/            # 62 tests across 5 test files
├── app/
│   ├── api/calendar/
│   │   ├── availability/     # GET available slots
│   │   ├── book/             # POST create booking
│   │   ├── manage/           # GET verify token + booking details
│   │   │   └── availability/ # GET slots for rescheduling
│   │   ├── reschedule/       # PUT reschedule booking
│   │   └── cancel/           # DELETE cancel booking
│   └── book/
│       ├── page.tsx          # Booking form UI
│       ├── manage/page.tsx   # Reschedule/cancel UI
│       └── layout.tsx        # Booking layout
└── components/ui/
    └── BackButton.tsx
```

---

## Contributing

Found a bug or missing feature? PRs welcome.

Open an issue describing what you hit and what you expected.

---

## License

MIT
