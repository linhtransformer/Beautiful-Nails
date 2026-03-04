-- Run this in the Supabase SQL Editor at:
-- https://supabase.com/dashboard/project/cgnkwhcsyzhrymfrensd/sql/new

CREATE TABLE IF NOT EXISTS appointments (
  id               UUID        DEFAULT gen_random_uuid() PRIMARY KEY,
  name             TEXT        NOT NULL,
  phone            TEXT        NOT NULL,
  email            TEXT        NOT NULL,
  date_of_birth    DATE,
  service_name     TEXT        NOT NULL,
  service_duration INTEGER     NOT NULL,  -- in minutes
  service_price    TEXT        NOT NULL,
  appointment_date DATE        NOT NULL,
  appointment_time TIME        NOT NULL,
  status           TEXT        DEFAULT 'pending',
  created_at       TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE appointments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Anyone can book"
  ON appointments FOR INSERT TO anon WITH CHECK (true);

CREATE POLICY "Anyone can view"
  ON appointments FOR SELECT TO anon USING (true);

CREATE POLICY "Anyone can update status"
  ON appointments FOR UPDATE TO anon USING (true);
