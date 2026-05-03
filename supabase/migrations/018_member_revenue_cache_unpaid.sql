-- Ajouter les colonnes de factures impayées et revenus déposés par membre
ALTER TABLE public.member_revenue_cache
  ADD COLUMN IF NOT EXISTS therapist_monthly_unpaid   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS therapist_annual_unpaid    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS therapist_quarterly_unpaid NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closer_monthly_unpaid      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closer_annual_unpaid       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS closer_quarterly_unpaid    NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setter_monthly_unpaid      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setter_annual_unpaid       NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS setter_quarterly_unpaid    NUMERIC DEFAULT 0;
