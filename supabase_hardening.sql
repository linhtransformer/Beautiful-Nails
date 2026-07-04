-- Beautiful Nails — database hardening
-- Run this once in the Supabase dashboard: SQL Editor → New query → paste → Run.
-- (Project: "Moms appointment" / cgnkwhcsyzhrymfrensd)

-- 1. Stop direct inserts from the browser key.
--    All bookings must go through the book-appointment edge function,
--    which enforces: 2.5h lead time, max 3 overlapping appointments,
--    opening hours, and max 2 open appointments per phone number.
--    (The website only needs SELECT for showing availability; admin.html
--    only needs SELECT and UPDATE for status changes — both keep working.)
drop policy if exists "Allow anonymous inserts" on public.appointments;
revoke insert on public.appointments from anon;

-- 2. Reminder bookkeeping: guarantees each appointment gets at most one
--    reminder email, even if the daily job runs twice.
alter table public.appointments
  add column if not exists reminder_sent_at timestamptz;
