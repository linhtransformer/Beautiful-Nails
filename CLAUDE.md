# CLAUDE.md — Beautiful Nails Project Context

## Project Overview
**Beautiful Nails** — a Dutch nail salon website with online booking, admin dashboard, and a voice AI receptionist.
- **GitHub:** https://github.com/linhtransformer/Beautiful-Nails
- **Supabase project ref:** `cgnkwhcsyzhrymfrensd`
- **Supabase URL:** `https://cgnkwhcsyzhrymfrensd.supabase.co`

---

## Files & What They Do

| File | Purpose |
|------|---------|
| `index.html` | Main landing/home page |
| `book.html` | Multi-step booking form (service → date/time → details → confirm) |
| `admin.html` | Admin dashboard — shows appointments, real-time via Supabase subscription |
| `setup-vapi.mjs` | One-time script to create the Sophie voice assistant in Vapi |
| `.env` | API keys (gitignored — never commit this) |
| `supabase/functions/send-booking-confirmation/index.ts` | Deno Edge Function — sends branded confirmation email via Resend |
| `supabase/functions/vapi-tools/index.ts` | Deno Edge Function — handles all 7 Vapi tool calls (get_services, book_appointment, etc.) |

---

## Tech Stack

- **Frontend:** Single HTML files, Tailwind CDN, Tenor Sans + Playfair Display fonts
- **Backend:** Supabase (PostgreSQL + Edge Functions + Realtime)
- **Email:** Resend API — from `afspraken@nagelstudiobeautifulnails.nl`
- **Voice AI:** Vapi — Dutch-speaking assistant "Sophie" (assistant ID: `e51b8fc0-b4db-4568-90c9-8b0761654e2b`)
- **Deployment:** GitHub Pages (or static hosting via the repo)

---

## Branding

- **Colors:** `--wine: #7c3a3a`, `--cream: #f7f2ec`, `--blush: #ede7e0`, `--muted: #c4988c`, `--dark: #2c2826`
- **Fonts:** Playfair Display (display/headings, italic), Tenor Sans (body)
- **Logo:** `Brand asset/Brand logo.png`
- **Domain:** `nagelstudiobeautifulnails.nl` (verified in Resend)

---

## Database Tables (Supabase)

### `appointments`
| Column | Type | Notes |
|--------|------|-------|
| id | uuid | primary key |
| name | text | full name |
| phone | text | |
| email | text | |
| service_name | text | may be multiple joined with " + " |
| service_price | text | e.g. "~€ 55" or "Op aanvraag" |
| service_duration | integer | minutes (total) |
| appointment_date | date | |
| appointment_time | time | |
| notes | text | nullable |
| status | text | 'pending', 'confirmed', 'cancelled' |
| created_at | timestamptz | |

### `services`
Stores all treatment options with name, category, price (text), duration (int minutes).

### `business_info`
Key-value pairs: name, address, phone, website.

### `opening_hours`
day_of_week (0=Sun–6=Sat), is_open (bool), open_time (TIME), close_time (TIME).

---

## Opening Hours (hardcoded in book.html)
```
Sunday:    Closed
Monday:    11:00–18:00
Tuesday:   10:00–18:00
Wednesday: 10:00–18:00
Thursday:  10:00–18:00
Friday:    10:00–21:00
Saturday:  10:00–17:00
```

---

## Booking Flow (book.html)

1. **Step 1 — Service:** Multi-select service cards (toggle on/off). Shows live selection summary with combined price (~€ X) and duration (~X min).
2. **Step 2 — Date & Time:** Calendar + available time slots (fetched from Supabase, excludes booked slots).
3. **Step 3 — Details:** Name, phone, email, optional notes.
4. **Step 4 — Confirm:** Summary card → INSERT into `appointments` table.
5. **Email:** Sent automatically via PostgreSQL AFTER INSERT trigger using `pg_net` → calls the `send-booking-confirmation` Edge Function.

---

## Admin Dashboard (admin.html)

- Protected by Supabase Auth (email/password login)
- Real-time subscription to `appointments` table — auto-refreshes when new bookings arrive (including from voice agent)
- Can confirm/cancel appointments

---

## Voice Agent — Sophie (Vapi)

- **Name:** Sophie – Beautiful Nails
- **Language:** Dutch (nl)
- **Voice:** OpenAI nova
- **Transcriber:** Deepgram nova-2
- **Tools endpoint:** `https://cgnkwhcsyzhrymfrensd.supabase.co/functions/v1/vapi-tools`
- **Tools:** `get_business_info`, `get_services`, `get_opening_hours`, `get_available_slots`, `book_appointment`, `get_appointments`, `update_appointment`
- To recreate the assistant: `node setup-vapi.mjs` (needs VAPI_API_KEY in .env)
- To buy a phone number: go to Vapi dashboard → Phone Numbers → assign to "Sophie – Beautiful Nails"

---

## Email Trigger (PostgreSQL)

A trigger `on_appointment_created` fires AFTER INSERT on `appointments` and calls `pg_net.http_post` to the `send-booking-confirmation` Edge Function. The trigger has `EXCEPTION WHEN OTHERS THEN NULL` so email failures never block a booking.

---

## Environment Variables (.env — never commit)

```
VAPI_API_KEY=...
SUPABASE_ACCESS_TOKEN=...
RESEND_API_KEY=...
SUPABASE_SERVICE_ROLE_KEY=...
```

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are auto-injected into Edge Functions by Supabase — no need to set them as secrets.

---

## Deployment Commands

```bash
# Deploy an Edge Function
npx supabase --workdir "c:/Users/litli/Downloads/project Mom" functions deploy <function-name>

# Set a secret
npx supabase --workdir "c:/Users/litli/Downloads/project Mom" secrets set KEY=value

# Push to GitHub (deploys site)
git add <files>
git commit -m "message"
git push
```

---

## Frontend Design Rules (Always Apply)

- **Invoke the `frontend-design` skill** before writing any frontend code.
- Colors: always use the brand palette above — never default Tailwind blue/indigo.
- Shadows: layered, color-tinted, low opacity.
- Typography: Playfair Display (headings, italic) + Tenor Sans (body).
- No `transition-all`. Only animate `transform` and `opacity`.
- Every clickable element needs hover, focus-visible, and active states.
- Mobile-first responsive.
- Single HTML file with all styles inline unless told otherwise.

### Local Server & Screenshots
- Start server: `node serve.mjs` (serves at `http://localhost:3000`)
- Screenshot: `node screenshot.mjs http://localhost:3000`
- Screenshots saved to `./temporary screenshots/`
- Always screenshot from localhost, never `file:///`
