-- Montant du boni annuel cible (remplace le calcul 10% salaire)
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS annual_bonus NUMERIC DEFAULT NULL;

-- Historique des boni trimestriels par membre
CREATE TABLE IF NOT EXISTS public.quarterly_bonuses (
  id           UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year         INTEGER NOT NULL,
  quarter      INTEGER NOT NULL CHECK (quarter BETWEEN 1 AND 4),
  achievement_pct NUMERIC DEFAULT NULL,
  bonus_paid   NUMERIC DEFAULT NULL,
  is_paid      BOOLEAN NOT NULL DEFAULT FALSE,
  notes        TEXT DEFAULT NULL,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, quarter)
);

ALTER TABLE public.quarterly_bonuses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin full access quarterly_bonuses" ON public.quarterly_bonuses
  FOR ALL TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

CREATE POLICY "Member reads own quarterly_bonuses" ON public.quarterly_bonuses
  FOR SELECT TO authenticated
  USING (user_id = auth.uid());
