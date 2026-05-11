-- ── Closer Dashboard — Table des rendez-vous GHL ─────────────────────────────
--
-- Calendriers GHL synchronisés (rencontres découverte + suivi) :
--   Découverte : 4227QzeKvFczi5BZyHOC, DIN6EPtG7eNU3Gf6ZRoC, ucyJmhYKKDDm7U5JmaJ8
--   Suivi      : BQK4NoyrVNuJA3e1VHDH
--

CREATE TABLE IF NOT EXISTS public.ghl_appointments (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_id           TEXT NOT NULL UNIQUE,
  location_id      TEXT NOT NULL,
  calendar_id      TEXT NOT NULL DEFAULT '',
  contact_id       TEXT DEFAULT '',
  contact_name     TEXT DEFAULT '',
  contact_email    TEXT DEFAULT '',
  assigned_user_id TEXT DEFAULT '',
  start_time       TIMESTAMPTZ,
  end_time         TIMESTAMPTZ,
  status           TEXT DEFAULT '',   -- confirmed | cancelled | noshow | showed
  meeting_url      TEXT DEFAULT '',   -- Google Meet ou lien visio
  notes            TEXT DEFAULT '',
  raw              JSONB,
  synced_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- RLS
ALTER TABLE public.ghl_appointments ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "read_ghl_appointments"         ON public.ghl_appointments;
DROP POLICY IF EXISTS "service_write_ghl_appointments" ON public.ghl_appointments;

CREATE POLICY "read_ghl_appointments"
  ON public.ghl_appointments FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_ghl_appointments"
  ON public.ghl_appointments FOR ALL TO service_role USING (true);

-- Index
CREATE INDEX IF NOT EXISTS idx_ghl_appts_contact   ON public.ghl_appointments (contact_id);
CREATE INDEX IF NOT EXISTS idx_ghl_appts_calendar  ON public.ghl_appointments (calendar_id);
CREATE INDEX IF NOT EXISTS idx_ghl_appts_start     ON public.ghl_appointments (start_time);
CREATE INDEX IF NOT EXISTS idx_ghl_appts_status    ON public.ghl_appointments (status);
