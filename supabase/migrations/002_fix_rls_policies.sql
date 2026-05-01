-- =============================================
-- Fix: récursion infinie dans les policies RLS
-- La policy sur profiles faisait une requête sur profiles → boucle infinie
-- Solution: fonction SECURITY DEFINER qui bypass le RLS
-- =============================================

-- Fonction helper qui vérifie le rôle admin sans passer par RLS
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid() AND role = 'admin'
  );
$$ LANGUAGE sql SECURITY DEFINER STABLE;

-- =============================================
-- PROFILES — recréer les policies
-- =============================================
DROP POLICY IF EXISTS "Admin accès total profiles" ON public.profiles;
DROP POLICY IF EXISTS "Membre lit son propre profil" ON public.profiles;

CREATE POLICY "Admin accès total profiles" ON public.profiles
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre lit son propre profil" ON public.profiles
  FOR SELECT USING (id = auth.uid());

-- =============================================
-- OBJECTIVES — recréer les policies
-- =============================================
DROP POLICY IF EXISTS "Admin accès total objectives" ON public.objectives;
DROP POLICY IF EXISTS "Membre lit ses propres objectifs" ON public.objectives;

CREATE POLICY "Admin accès total objectives" ON public.objectives
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre lit ses propres objectifs" ON public.objectives
  FOR SELECT USING (user_id = auth.uid());

-- =============================================
-- KPI_ENTRIES — recréer les policies
-- =============================================
DROP POLICY IF EXISTS "Admin accès total kpi_entries" ON public.kpi_entries;
DROP POLICY IF EXISTS "Membre lit ses propres KPIs" ON public.kpi_entries;
DROP POLICY IF EXISTS "Membre insère ses propres KPIs" ON public.kpi_entries;

CREATE POLICY "Admin accès total kpi_entries" ON public.kpi_entries
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre lit ses propres KPIs" ON public.kpi_entries
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Membre insère ses propres KPIs" ON public.kpi_entries
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- =============================================
-- END_OF_DAY_REPORTS — recréer les policies
-- =============================================
DROP POLICY IF EXISTS "Admin accès total end_of_day_reports" ON public.end_of_day_reports;
DROP POLICY IF EXISTS "Membre lit ses propres rapports" ON public.end_of_day_reports;
DROP POLICY IF EXISTS "Membre soumet ses propres rapports" ON public.end_of_day_reports;

CREATE POLICY "Admin accès total end_of_day_reports" ON public.end_of_day_reports
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre lit ses propres rapports" ON public.end_of_day_reports
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Membre soumet ses propres rapports" ON public.end_of_day_reports
  FOR INSERT WITH CHECK (user_id = auth.uid());

-- =============================================
-- TASKS — recréer les policies
-- =============================================
DROP POLICY IF EXISTS "Admin accès total tasks" ON public.tasks;
DROP POLICY IF EXISTS "Membre lit ses propres tâches" ON public.tasks;
DROP POLICY IF EXISTS "Membre met à jour complétion" ON public.tasks;

CREATE POLICY "Admin accès total tasks" ON public.tasks
  FOR ALL USING (public.is_admin());

CREATE POLICY "Membre lit ses propres tâches" ON public.tasks
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "Membre met à jour complétion" ON public.tasks
  FOR UPDATE
  USING (user_id = auth.uid())
  WITH CHECK (user_id = auth.uid());
