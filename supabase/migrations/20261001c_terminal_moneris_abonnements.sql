-- Terminal Moneris : Moneris gère les prélèvements récurrents (API Subscriptions).
-- NEO garde l'échéancier (payment_installments) pour l'affichage, les reçus
-- QuickBooks et les commissions, et se synchronise avec Moneris.

ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS frequency_unit TEXT NOT NULL DEFAULT 'WEEK'
    CHECK (frequency_unit IN ('DAY','WEEK','MONTH')),
  ADD COLUMN IF NOT EXISTS frequency_interval INTEGER NOT NULL DEFAULT 1
    CHECK (frequency_interval BETWEEN 1 AND 99),
  ADD COLUMN IF NOT EXISTS moneris_subscription_id TEXT,
  -- ACTIVE | PAUSED | DECLINED | DECLINED_RETRY | COMPLETED | CANCELED | ERROR (création ratée)
  ADD COLUMN IF NOT EXISTS subscription_status TEXT,
  ADD COLUMN IF NOT EXISTS subscription_error TEXT;

CREATE INDEX IF NOT EXISTS payment_plans_subscription_idx
  ON public.payment_plans(moneris_subscription_id) WHERE moneris_subscription_id IS NOT NULL;
