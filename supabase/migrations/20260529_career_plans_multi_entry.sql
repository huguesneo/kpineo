-- Permet plusieurs entrées par année (ex: augmentation en cours d'année)
-- et ajoute une date d'entrée en vigueur optionnelle

ALTER TABLE public.career_plans
  DROP CONSTRAINT IF EXISTS career_plans_user_id_year_key;

ALTER TABLE public.career_plans
  ADD COLUMN IF NOT EXISTS effective_date DATE;
