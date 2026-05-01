-- =============================================
-- QuickBooks OAuth tokens + Revenue cache
-- =============================================

-- Stockage des tokens OAuth QuickBooks (une seule ligne)
CREATE TABLE IF NOT EXISTS public.quickbooks_tokens (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  access_token  TEXT        NOT NULL,
  refresh_token TEXT        NOT NULL,
  realm_id      TEXT        NOT NULL,
  expires_at    TIMESTAMPTZ NOT NULL,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.quickbooks_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gère les tokens QuickBooks" ON public.quickbooks_tokens
  FOR ALL USING (public.is_admin());

-- Cache des revenus QuickBooks (une seule ligne)
CREATE TABLE IF NOT EXISTS public.revenue_cache (
  id                   UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  monthly_revenue      NUMERIC     DEFAULT 0,
  prev_monthly_revenue NUMERIC     DEFAULT 0,
  annual_revenue       NUMERIC     DEFAULT 0,
  last_synced_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.revenue_cache ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin lit le cache revenus" ON public.revenue_cache
  FOR ALL USING (public.is_admin());
