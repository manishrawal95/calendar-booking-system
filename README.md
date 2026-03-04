# Next.js Booking System

Production booking system with Google Calendar integration, email confirmations, and timezone-aware scheduling. Built with Next.js 14 App Router.

**[Live demo →](https://mrawal.com/book)**

## Features

- **Two booking types** — 30-minute deep dive and 15-minute quick chat
- **15-minute slot generation** with configurable buffers and conflict detection
- **Google Calendar integration** — Creates events with Google Meet links automatically
- **Email confirmations** via Resend with HTML templates
- **Scheduled reminders** — 24-hour and 1-hour before meeting, auto-cancelled if booking is cancelled
- **ICS calendar attachments** — Download .ics file from confirmation email
- **Secure manage links** — HMAC-signed tokens for rescheduling and cancellation (no auth required)
- **Rescheduling + cancellation** — Full flow with calendar event updates and email notifications
- **Input validation** — Name, email (blocks disposable domains), LinkedIn URL, agenda length
- **Timezone-aware** — All slot generation uses Luxon for correct timezone handling
- **62 tests** covering slot generation, validation, calendar utilities, reminders, and availability

## Architecture

```
User → /book (select time) → POST /api/calendar/book
                                  ├→ Google Calendar (create event + Meet link)
                                  ├→ Resend (confirmation email with ICS)
                                  └→ Resend (schedule 24h + 1h reminders)

User → /book/manage?token=... → GET /api/calendar/manage (verify HMAC token)
                                  ├→ Reschedule → PUT /api/calendar/reschedule
                                  └→ Cancel → DELETE /api/calendar/cancel
                                                ├→ Google Calendar (delete event)
                                                ├→ Resend (cancellation email)
                                                └→ Resend (cancel scheduled reminders)
```

## Key Design Decisions

- **Slot generation with conflict detection** — Queries Google Calendar freebusy API, applies buffer time between meetings, respects business hours
- **HMAC tokens for manage URLs** — Booking recipients get a signed link to manage their booking without needing to log in. Tokens encode the event ID and are verified server-side
- **Resend `scheduledAt`** — Reminders are scheduled at booking time using Resend's built-in scheduling, avoiding the need for a separate cron job or queue

## Tech Stack

- [Next.js 14](https://nextjs.org/) (App Router)
- TypeScript
- [Google Calendar API](https://developers.google.com/calendar) (googleapis)
- [Resend](https://resend.com/) (transactional email)
- [Luxon](https://moment.github.io/luxon/) (timezone-aware date handling)
- [Vitest](https://vitest.dev/) (testing)

## Project Structure

```
src/
├── lib/
│   ├── google-calendar.ts    # Calendar slot generation, availability, event CRUD
│   ├── booking-email.ts      # HTML/text email templates
│   ├── schedule-reminders.ts # Resend scheduled reminders (24h + 1h)
│   ├── booking-ics.ts        # ICS calendar file generation
│   ├── booking-token.ts      # HMAC token generation/verification
│   ├── calendar-utils.ts     # Helpers for extracting data from calendar events
│   ├── validation.ts         # Input validation (name, email, LinkedIn, agenda)
│   └── __tests__/            # 62 tests across 5 test files
├── app/
│   ├── api/calendar/
│   │   ├── availability/     # GET available slots
│   │   ├── book/             # POST create booking
│   │   ├── manage/           # GET verify manage token + booking details
│   │   │   └── availability/ # GET slots for rescheduling
│   │   ├── reschedule/       # PUT reschedule booking
│   │   └── cancel/           # DELETE cancel booking
│   └── book/
│       ├── page.tsx          # Booking form UI
│       ├── manage/page.tsx   # Manage booking UI (reschedule/cancel)
│       └── layout.tsx        # Booking layout
└── components/ui/
    └── BackButton.tsx        # Shared navigation component
```

## Setup

### Prerequisites

- Node.js 18+
- Google Cloud project with Calendar API enabled
- Google service account with calendar access
- [Resend](https://resend.com/) account

### Environment Variables

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

### Install & Run

```bash
npm install
npm run dev
```

## Testing

```bash
npm test
```

Runs 62 tests across 5 test suites covering:

- **Slot generation** — Business hours, buffers, conflict detection
- **Validation** — Email, name, LinkedIn URL, agenda
- **Calendar utilities** — Event data extraction
- **Reminders** — Scheduling and cancellation logic
- **Availability** — End-to-end availability endpoint logic

## License

MIT
