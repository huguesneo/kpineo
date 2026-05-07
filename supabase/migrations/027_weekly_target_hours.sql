-- Ajoute une cible d'heures hebdomadaires personnalisée par membre
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS weekly_target_hours NUMERIC(5,2) NOT NULL DEFAULT 40;
