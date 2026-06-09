-- =============================================================================
-- REER — passage au modèle de cotisation égalée (matching)
-- 3 conditions pour qu'un versement NEO ait lieu un mois donné, par naturo :
--   1. Le naturo a cotisé à son REER ce mois (montant saisi = preuve reçue)
--   2. Profit NEO du mois >= plancher
--   3. NEO verse le même montant, plafonné à X % du salaire mensuel du naturo
-- =============================================================================

-- Cotisations mensuelles des naturos (ce qu'ILS mettent dans leur REER)
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS reer_contrib_thibault numeric(12,2) DEFAULT 0;
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS reer_contrib_brice    numeric(12,2) DEFAULT 0;
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS reer_contrib_jessica  numeric(12,2) DEFAULT 0;
ALTER TABLE public.neo_monthly_metrics ADD COLUMN IF NOT EXISTS reer_contrib_tamara   numeric(12,2) DEFAULT 0;

-- Plafond du versement NEO en % du salaire mensuel (3 % par défaut)
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS reer_match_cap_pct numeric(5,4) DEFAULT 0.03;

-- Aligne le plancher sur la règle (17 000 $) si la valeur par défaut n'a pas été modifiée
UPDATE public.neo_performance_params SET reer_plancher = 17000 WHERE id = 1 AND reer_plancher = 16382;
