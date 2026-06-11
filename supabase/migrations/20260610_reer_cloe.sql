-- =============================================================================
-- REER — ajout de Cloé (conditions KPI réseaux sociaux, pas de condition de marge)
-- =============================================================================

-- Paramètres de Cloé
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS salaire_cloe numeric(12,2) DEFAULT 0;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_seuil_reels_cloe integer DEFAULT 20;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_seuil_leads_cloe integer DEFAULT 0;

-- Données mensuelles de Cloé
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS cotisation_cloe numeric(10,2) DEFAULT 0;
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS reels_cloe integer DEFAULT 0;
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS leads_organiques_cloe integer DEFAULT 0;
