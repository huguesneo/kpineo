-- Cache des résultats d'attribution Meta (pour chargement instantané)
CREATE TABLE IF NOT EXISTS public.meta_attribution_cache (
  cache_key   TEXT PRIMARY KEY,          -- "startDate_endDate"
  payload     JSONB NOT NULL,
  computed_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.meta_attribution_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read meta_attribution_cache" ON public.meta_attribution_cache
  FOR SELECT TO authenticated USING (true);
CREATE POLICY "service_write_meta_attribution_cache" ON public.meta_attribution_cache
  FOR ALL TO service_role USING (true);
