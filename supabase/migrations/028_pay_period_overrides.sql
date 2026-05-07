-- Table pour les corrections manuelles admin sur les heures d'une période de paie
CREATE TABLE IF NOT EXISTS public.pay_period_overrides (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  period_start DATE NOT NULL,
  override_hours NUMERIC(6,2) NOT NULL,
  notes TEXT,
  updated_by UUID REFERENCES public.profiles(id),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, period_start)
);

ALTER TABLE public.pay_period_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total pay_period_overrides" ON public.pay_period_overrides
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );

CREATE POLICY "Membre lit ses propres overrides" ON public.pay_period_overrides
  FOR SELECT
  USING (user_id = auth.uid());
