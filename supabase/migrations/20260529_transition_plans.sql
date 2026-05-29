-- Plan de transition mensuel (répartition du temps + focus du mois)

CREATE TABLE IF NOT EXISTS public.transition_plans (
  id               UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id          UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  month            DATE NOT NULL,             -- toujours le 1er du mois
  time_split       TEXT,                      -- ex: "65% admin, 35% contenu"
  focus_items      TEXT[] NOT NULL DEFAULT '{}',
  notes            TEXT,
  visible_to_member BOOLEAN NOT NULL DEFAULT false,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, month)
);

ALTER TABLE public.transition_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gère les plans de transition" ON public.transition_plans
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre voit son plan de transition si activé" ON public.transition_plans
  FOR SELECT USING (user_id = auth.uid() AND visible_to_member = true);
