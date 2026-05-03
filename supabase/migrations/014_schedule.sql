-- Horaires hebdomadaires
CREATE TABLE IF NOT EXISTS public.schedules (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  effective_from DATE NOT NULL,
  effective_to DATE,
  monday_hours    NUMERIC(4,2) NOT NULL DEFAULT 0,
  tuesday_hours   NUMERIC(4,2) NOT NULL DEFAULT 0,
  wednesday_hours NUMERIC(4,2) NOT NULL DEFAULT 0,
  thursday_hours  NUMERIC(4,2) NOT NULL DEFAULT 0,
  friday_hours    NUMERIC(4,2) NOT NULL DEFAULT 0,
  saturday_hours  NUMERIC(4,2) NOT NULL DEFAULT 0,
  sunday_hours    NUMERIC(4,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.schedules ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access schedules"      ON public.schedules;
DROP POLICY IF EXISTS "Member full access own schedules" ON public.schedules;
CREATE POLICY "Admin full access schedules"      ON public.schedules FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Member full access own schedules" ON public.schedules FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Absences (maladie + vacances)
CREATE TABLE IF NOT EXISTS public.absences (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('sick', 'vacation')),
  start_date DATE NOT NULL,
  end_date   DATE NOT NULL,
  hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
ALTER TABLE public.absences ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access absences"      ON public.absences;
DROP POLICY IF EXISTS "Member full access own absences" ON public.absences;
CREATE POLICY "Admin full access absences"      ON public.absences FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Member full access own absences" ON public.absences FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

-- Allocations annuelles (admin définit)
CREATE TABLE IF NOT EXISTS public.absence_allowances (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year INTEGER NOT NULL,
  sick_hours     NUMERIC(6,2) NOT NULL DEFAULT 0,
  vacation_hours NUMERIC(6,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, year)
);
ALTER TABLE public.absence_allowances ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access allowances" ON public.absence_allowances;
DROP POLICY IF EXISTS "Member reads own allowances"  ON public.absence_allowances;
CREATE POLICY "Admin full access allowances"   ON public.absence_allowances FOR ALL    TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Member reads own allowances"    ON public.absence_allowances FOR SELECT TO authenticated USING (user_id = auth.uid());

-- Heures supplémentaires (rattrapage de dépassement)
CREATE TABLE IF NOT EXISTS public.overtime_records (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  week_start DATE NOT NULL,
  extra_hours NUMERIC(4,2) NOT NULL DEFAULT 0,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, week_start)
);
ALTER TABLE public.overtime_records ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Admin full access overtime"      ON public.overtime_records;
DROP POLICY IF EXISTS "Member full access own overtime" ON public.overtime_records;
CREATE POLICY "Admin full access overtime"      ON public.overtime_records FOR ALL TO authenticated USING (public.is_admin()) WITH CHECK (public.is_admin());
CREATE POLICY "Member full access own overtime" ON public.overtime_records FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
