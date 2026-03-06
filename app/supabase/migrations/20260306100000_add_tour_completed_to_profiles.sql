ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS tour_completed boolean NOT NULL DEFAULT false;
