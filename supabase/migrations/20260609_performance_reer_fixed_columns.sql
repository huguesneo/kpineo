-- =============================================================================
-- Performance & REER — coûts fixes par mois (réels, importés de QuickBooks)
-- Colonnes nullables : si NULL, le calcul retombe sur les paramètres globaux.
-- =============================================================================

ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS loyer numeric(12,2);
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS amortissement numeric(12,2);
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS auto_fixe numeric(12,2);
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS essence numeric(12,2);
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS telecom numeric(12,2);
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS abonnements numeric(12,2);
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS outils_info numeric(12,2);
