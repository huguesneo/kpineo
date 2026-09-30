-- Adresse du client (vérification d'adresse Moneris + reçu QuickBooks)
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS client_street_number TEXT,
  ADD COLUMN IF NOT EXISTS client_street_name   TEXT,
  ADD COLUMN IF NOT EXISTS client_unit          TEXT,
  ADD COLUMN IF NOT EXISTS client_city          TEXT,
  ADD COLUMN IF NOT EXISTS client_province      TEXT,
  ADD COLUMN IF NOT EXISTS client_postal_code   TEXT;
