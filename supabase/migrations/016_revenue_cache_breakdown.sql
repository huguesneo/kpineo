ALTER TABLE public.revenue_cache
  ADD COLUMN IF NOT EXISTS monthly_invoices_paid  NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_invoices_paid   NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS monthly_deposited      NUMERIC DEFAULT 0,
  ADD COLUMN IF NOT EXISTS annual_deposited       NUMERIC DEFAULT 0;
