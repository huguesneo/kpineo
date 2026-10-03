-- Reçu QuickBooks du terminal : thérapeute (RDV d'évaluation GHL) et setter (opportunité GHL),
-- trouvés au 1er reçu puis réutilisés pour les reçus des versements suivants.
ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS therapist_name TEXT,
  ADD COLUMN IF NOT EXISTS setter_name    TEXT;
