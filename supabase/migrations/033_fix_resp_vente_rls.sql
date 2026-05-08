-- ── Fix récursion infinie — Policies RespVente ───────────────────────────────
--
-- Les sous-requêtes sur public.profiles dans les policies déclenchaient les
-- policies de la même table → boucle infinie → HTTP 500.
-- Solution : fonctions SECURITY DEFINER qui bypassent le RLS.
--

-- Fonctions helpers (SECURITY DEFINER = pas de RLS appliqué)
CREATE OR REPLACE FUNCTION public.current_user_role()
RETURNS TEXT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM profiles WHERE id = auth.uid()
$$;

CREATE OR REPLACE FUNCTION public.is_sales_role(target_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM profiles WHERE id = target_id AND role IN ('setter', 'closer')
  )
$$;

-- Supprimer les anciennes policies (avec récursion)
DROP POLICY IF EXISTS "RespVente lit profils setter/closer"       ON public.profiles;
DROP POLICY IF EXISTS "RespVente gère objectifs setter/closer"    ON public.objectives;
DROP POLICY IF EXISTS "RespVente lit kpi_entries setter/closer"   ON public.kpi_entries;
DROP POLICY IF EXISTS "RespVente gère tâches setter/closer"       ON public.tasks;
DROP POLICY IF EXISTS "RespVente lit eod_reports setter/closer"   ON public.end_of_day_reports;

-- Recréer sans récursion

-- 1. Profils
CREATE POLICY "RespVente lit profils setter/closer" ON public.profiles
  FOR SELECT
  USING (
    role IN ('setter', 'closer')
    AND public.current_user_role() = 'resp_vente'
  );

-- 2. Objectifs
CREATE POLICY "RespVente gère objectifs setter/closer" ON public.objectives
  FOR ALL
  USING (
    public.current_user_role() = 'resp_vente'
    AND public.is_sales_role(user_id)
  )
  WITH CHECK (
    public.current_user_role() = 'resp_vente'
    AND public.is_sales_role(user_id)
  );

-- 3. KPI entries
CREATE POLICY "RespVente lit kpi_entries setter/closer" ON public.kpi_entries
  FOR SELECT
  USING (
    public.current_user_role() = 'resp_vente'
    AND public.is_sales_role(user_id)
  );

-- 4. Tâches
CREATE POLICY "RespVente gère tâches setter/closer" ON public.tasks
  FOR ALL
  USING (
    public.current_user_role() = 'resp_vente'
    AND (
      created_by = auth.uid()
      OR public.is_sales_role(user_id)
    )
  )
  WITH CHECK (
    public.current_user_role() = 'resp_vente'
    AND public.is_sales_role(user_id)
  );

-- 5. Rapports EOD
CREATE POLICY "RespVente lit eod_reports setter/closer" ON public.end_of_day_reports
  FOR SELECT
  USING (
    public.current_user_role() = 'resp_vente'
    AND public.is_sales_role(user_id)
  );
