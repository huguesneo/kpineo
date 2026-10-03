-- Terminal : ajouts (garantie, programme d'entraînement +100 $) et rabais (% sur tout, $ sur le 1er versement)
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS pretax_amount_cents INTEGER,
  ADD COLUMN IF NOT EXISTS training_addon  BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS guarantee_addon BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS discount_type   TEXT CHECK (discount_type IN ('percent','amount')),
  ADD COLUMN IF NOT EXISTS discount_value  NUMERIC;
