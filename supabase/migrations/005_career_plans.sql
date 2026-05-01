-- =============================================
-- Plan de carrière + salaire de base
-- =============================================

ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS base_salary NUMERIC;

CREATE TABLE IF NOT EXISTS public.career_plans (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  planned_salary NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year)
);

ALTER TABLE public.career_plans ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gère les plans carrière" ON public.career_plans
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre voit son plan carrière" ON public.career_plans
  FOR SELECT USING (user_id = auth.uid());
