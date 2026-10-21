-- Terminal : paiement unique hors produit (hugues@, info@). Un seul débit, taxes ajoutées,
-- description libre dans product_name. Ni reçu QuickBooks automatique, ni carte 🎯 Vente.
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS manual BOOLEAN NOT NULL DEFAULT false;
