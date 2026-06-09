-- =============================================================================
-- Module Performance & REER — tables privées (accès réservé à Hugues)
-- =============================================================================

-- Helper : seul hugues@neoperformance.ca peut accéder à ces données.
CREATE OR REPLACE FUNCTION public.is_hugues()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') = 'hugues@neoperformance.ca';
$$ LANGUAGE sql STABLE;

-- ----------------------------------------------------------------------------
-- Métriques financières mensuelles
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.neo_monthly_metrics (
  id uuid primary key default gen_random_uuid(),
  year integer not null,
  month integer not null check (month between 1 and 12),
  -- Revenus
  revenue_total numeric(12,2) default 0,
  revenue_thibault numeric(12,2) default 0,
  revenue_brice numeric(12,2) default 0,
  revenue_jessica numeric(12,2) default 0,
  revenue_tamara numeric(12,2) default 0,
  -- Coûts variables (entrés manuellement)
  cogs_total numeric(12,2) default 0,
  salary_charges numeric(12,2) default 0,
  ads_meta numeric(12,2) default 0,
  ads_other numeric(12,2) default 0,
  bank_fees numeric(12,2) default 0,
  professional_fees numeric(12,2) default 0,
  exceptional_expenses numeric(12,2) default 0,
  -- Notes
  notes text default '',
  -- Timestamps
  created_at timestamp with time zone default now(),
  updated_at timestamp with time zone default now(),
  unique(year, month)
);

ALTER TABLE public.neo_monthly_metrics ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hugues gère les métriques mensuelles" ON public.neo_monthly_metrics;
CREATE POLICY "Hugues gère les métriques mensuelles" ON public.neo_monthly_metrics
  FOR ALL USING (public.is_hugues()) WITH CHECK (public.is_hugues());

-- ----------------------------------------------------------------------------
-- Paramètres de performance (ligne unique)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.neo_performance_params (
  id integer primary key default 1,
  -- Coûts fixes mensuels (modifiables dans l'app)
  loyer numeric(12,2) default 9680,
  amortissement numeric(12,2) default 1403,
  auto_fixe numeric(12,2) default 3446,
  essence numeric(12,2) default 600,
  telecom numeric(12,2) default 286,
  abonnements numeric(12,2) default 500,
  outils_info numeric(12,2) default 1000,
  -- Salaires annuels des naturos
  salaire_thibault numeric(12,2) default 130000,
  salaire_brice numeric(12,2) default 64240,
  salaire_jessica numeric(12,2) default 82600,
  salaire_tamara numeric(12,2) default 70342,
  -- Ratios
  charges_sociales_pct numeric(5,4) default 0.16,
  cogs_ratio numeric(5,4) default 0.1084,
  marge_incrementale numeric(5,4) default 0.55,
  -- REER
  reer_plancher numeric(12,2) default 16382,
  reer_partage_pct numeric(5,4) default 0.25,
  updated_at timestamp with time zone default now(),
  constraint single_row check (id = 1)
);

ALTER TABLE public.neo_performance_params ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hugues gère les paramètres" ON public.neo_performance_params;
CREATE POLICY "Hugues gère les paramètres" ON public.neo_performance_params
  FOR ALL USING (public.is_hugues()) WITH CHECK (public.is_hugues());

-- Insérer les paramètres par défaut
INSERT INTO public.neo_performance_params (id) VALUES (1) ON CONFLICT DO NOTHING;
