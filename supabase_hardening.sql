-- Beautiful Nails — database hardening
-- ✅ APPLIED on 2026-07-04 via the Supabase management API.
-- Kept in the repo as a record. Safe to re-run (idempotent).

-- 1. Stop direct inserts from the browser key.
--    All bookings must go through the book-appointment edge function,
--    which enforces: 2.5h lead time, max 3 overlapping appointments,
--    opening hours, and max 2 open appointments per phone number.
--    (The website only needs SELECT for showing availability; admin.html
--    only needs SELECT and UPDATE for status changes — both keep working.)
drop policy if exists "Anyone can book" on public.appointments;
revoke insert on public.appointments from anon, authenticated;

-- 2. Reminder bookkeeping: guarantees each appointment gets at most one
--    reminder email, even if the daily job runs twice.
alter table public.appointments
  add column if not exists reminder_sent_at timestamptz;
