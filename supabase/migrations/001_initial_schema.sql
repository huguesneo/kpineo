-- =============================================
-- NEO Admin — Migration initiale
-- =============================================

-- Extension UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- TABLE: profiles
-- =============================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('naturopathe', 'closer', 'setter', 'admin')),
  avatar_url TEXT,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Les admins peuvent tout faire
CREATE POLICY "Admin accès total profiles" ON public.profiles
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Un membre peut lire son propre profil
CREATE POLICY "Membre lit son propre profil" ON public.profiles
  FOR SELECT
  USING (id = auth.uid());

-- =============================================
-- TABLE: objectives
-- =============================================
CREATE TABLE IF NOT EXISTS public.objectives (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  target_value NUMERIC NOT NULL,
  period_start DATE NOT NULL,
  period_end DATE NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.objectives ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total objectives" ON public.objectives
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Membre lit ses propres objectifs" ON public.objectives
  FOR SELECT
  USING (user_id = auth.uid());

-- =============================================
-- TABLE: kpi_entries
-- =============================================
CREATE TABLE IF NOT EXISTS public.kpi_entries (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entry_date DATE NOT NULL,
  kpi_type TEXT NOT NULL,
  value NUMERIC NOT NULL,
  notes TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kpi_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total kpi_entries" ON public.kpi_entries
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Membre lit ses propres KPIs" ON public.kpi_entries
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Membre insère ses propres KPIs" ON public.kpi_entries
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- TABLE: end_of_day_reports
-- =============================================
CREATE TABLE IF NOT EXISTS public.end_of_day_reports (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  report_date DATE NOT NULL,
  role TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}',
  submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.end_of_day_reports ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total end_of_day_reports" ON public.end_of_day_reports
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

CREATE POLICY "Membre lit ses propres rapports" ON public.end_of_day_reports
  FOR SELECT
  USING (user_id = auth.uid());

CREATE POLICY "Membre soumet ses propres rapports" ON public.end_of_day_reports
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- =============================================
-- TABLE: tasks
-- =============================================
CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.profiles(id),
  title TEXT NOT NULL,
  description TEXT,
  priority TEXT NOT NULL CHECK (priority IN ('prioritaire', 'secondaire')),
  is_completed BOOLEAN NOT NULL DEFAULT false,
  completed_at TIMESTAMPTZ,
  due_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;

-- Admin : accès total
CREATE POLICY "Admin accès total tasks" ON public.tasks
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'admin'
    )
  );

-- Membre : lecture de ses propres tâches
CREATE POLICY "Membre lit ses propres tâches" ON public.tasks
  FOR SELECT
  USING (user_id = auth.uid());

-- Membre : mise à jour limitée (seulement is_completed et completed_at)
CREATE POLICY "Membre met à jour complétion" ON public.tasks
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (
    user_id = auth.uid()
    -- On ne peut pas changer title, description, priority, due_date, created_by
  );

-- =============================================
-- TRIGGER: créer un profil après inscription
-- =============================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name, email, role)
  VALUES (
    NEW.id,
    COALESCE(NEW.raw_user_meta_data->>'full_name', 'Nouvel utilisateur'),
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'role', 'naturopathe')
  );
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
