ALTER TABLE public.member_revenue_cache
  ADD COLUMN IF NOT EXISTS therapist_quarterly NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closer_quarterly    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setter_quarterly    NUMERIC DEFAULT 0;
