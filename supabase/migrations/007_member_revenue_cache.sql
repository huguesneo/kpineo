CREATE TABLE IF NOT EXISTS public.member_revenue_cache (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  first_name TEXT NOT NULL UNIQUE,
  -- Thérapeute (naturopathe)
  therapist_monthly      NUMERIC DEFAULT 0,
  therapist_prev_monthly NUMERIC DEFAULT 0,
  therapist_annual       NUMERIC DEFAULT 0,
  -- Closer
  closer_monthly         NUMERIC DEFAULT 0,
  closer_prev_monthly    NUMERIC DEFAULT 0,
  closer_annual          NUMERIC DEFAULT 0,
  -- Setter
  setter_monthly         NUMERIC DEFAULT 0,
  setter_prev_monthly    NUMERIC DEFAULT 0,
  setter_annual          NUMERIC DEFAULT 0,
  last_synced_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.member_revenue_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_read" ON public.member_revenue_cache
  FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write" ON public.member_revenue_cache
  FOR ALL TO service_role USING (true);
