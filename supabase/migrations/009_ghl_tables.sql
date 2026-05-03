-- ── Go High Level : Contacts ────────────────────────────────
CREATE TABLE IF NOT EXISTS public.ghl_contacts (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_id          TEXT NOT NULL UNIQUE,
  location_id     TEXT NOT NULL,
  first_name      TEXT DEFAULT '',
  last_name       TEXT DEFAULT '',
  email           TEXT DEFAULT '',
  phone           TEXT DEFAULT '',
  tags            TEXT[] DEFAULT '{}',
  source          TEXT DEFAULT '',
  created_at_ghl  TIMESTAMPTZ,
  raw             JSONB,
  synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Go High Level : Pipelines ───────────────────────────────
CREATE TABLE IF NOT EXISTS public.ghl_pipelines (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_id       TEXT NOT NULL UNIQUE,
  location_id  TEXT NOT NULL,
  name         TEXT DEFAULT '',
  stages       JSONB DEFAULT '[]',
  synced_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Go High Level : Opportunités (leads) ────────────────────
CREATE TABLE IF NOT EXISTS public.ghl_opportunities (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ghl_id              TEXT NOT NULL UNIQUE,
  location_id         TEXT NOT NULL,
  contact_id          TEXT DEFAULT '',
  contact_name        TEXT DEFAULT '',
  pipeline_id         TEXT DEFAULT '',
  pipeline_stage_id   TEXT DEFAULT '',
  stage_name          TEXT DEFAULT '',
  status              TEXT DEFAULT '',
  monetary_value      NUMERIC DEFAULT 0,
  assigned_to         TEXT DEFAULT '',
  source              TEXT DEFAULT '',
  created_at_ghl      TIMESTAMPTZ,
  closed_at           TIMESTAMPTZ,
  raw                 JSONB,
  synced_at           TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── Config GHL (location ID, etc.) ──────────────────────────
CREATE TABLE IF NOT EXISTS public.ghl_config (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  location_id TEXT NOT NULL UNIQUE,
  name        TEXT DEFAULT '',
  last_synced_at TIMESTAMPTZ
);

-- ── RLS ─────────────────────────────────────────────────────
ALTER TABLE public.ghl_contacts     ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_pipelines    ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_opportunities ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ghl_config       ENABLE ROW LEVEL SECURITY;

CREATE POLICY "admin_read_ghl_contacts"      ON public.ghl_contacts      FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_read_ghl_pipelines"     ON public.ghl_pipelines     FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_read_ghl_opportunities" ON public.ghl_opportunities  FOR SELECT TO authenticated USING (true);
CREATE POLICY "admin_read_ghl_config"        ON public.ghl_config         FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_write_ghl_contacts"      ON public.ghl_contacts      FOR ALL TO service_role USING (true);
CREATE POLICY "service_write_ghl_pipelines"     ON public.ghl_pipelines     FOR ALL TO service_role USING (true);
CREATE POLICY "service_write_ghl_opportunities" ON public.ghl_opportunities  FOR ALL TO service_role USING (true);
CREATE POLICY "service_write_ghl_config"        ON public.ghl_config         FOR ALL TO service_role USING (true);

-- Index pour les requêtes fréquentes
CREATE INDEX IF NOT EXISTS idx_ghl_opps_location   ON public.ghl_opportunities (location_id);
CREATE INDEX IF NOT EXISTS idx_ghl_opps_status     ON public.ghl_opportunities (status);
CREATE INDEX IF NOT EXISTS idx_ghl_opps_created    ON public.ghl_opportunities (created_at_ghl);
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_location ON public.ghl_contacts (location_id);
