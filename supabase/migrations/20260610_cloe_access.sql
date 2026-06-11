-- =============================================================================
-- Accès self-service de Cloé (comme les naturos) — clé 'cloe' + KPI réseaux
-- =============================================================================

-- Autoriser la clé 'cloe' sur le lien de compte
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_perf_naturo_key_check;
ALTER TABLE public.profiles ADD CONSTRAINT profiles_perf_naturo_key_check
  CHECK (perf_naturo_key IS NULL OR perf_naturo_key IN ('thibault','brice','jessica','tamara','cloe'));

-- Autoriser 'cloe' dans les instantanés
ALTER TABLE public.neo_naturo_monthly DROP CONSTRAINT IF EXISTS neo_naturo_monthly_naturo_key_check;
ALTER TABLE public.neo_naturo_monthly ADD CONSTRAINT neo_naturo_monthly_naturo_key_check
  CHECK (naturo_key IN ('thibault','brice','jessica','tamara','cloe'));

-- Toggle de visibilité pour Cloé
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_visible_cloe boolean DEFAULT false;

-- Colonnes KPI sur l'instantané (Cloé voit ses Reels/leads, pas une marge)
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS is_cloe boolean DEFAULT false;
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS kpi_reels integer;
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS kpi_seuil_reels integer;
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS kpi_leads integer;
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS kpi_seuil_leads integer;
