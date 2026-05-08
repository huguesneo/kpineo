-- ── Resp. équipe de vente — Permissions équipe setter/closer ─────────────────
--
-- Donne au resp_vente la capacité de lire et gérer les données
-- des membres avec le rôle 'setter' ou 'closer'.
--

-- 1. Profils — resp_vente peut lire les profils setter/closer
CREATE POLICY "RespVente lit profils setter/closer" ON public.profiles
  FOR SELECT
  USING (
    role IN ('setter', 'closer')
    AND EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = auth.uid() AND p.role = 'resp_vente'
    )
  );

-- 2. Objectifs — resp_vente peut tout gérer pour setter/closer
CREATE POLICY "RespVente gère objectifs setter/closer" ON public.objectives
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente')
    AND user_id IN (SELECT id FROM public.profiles WHERE role IN ('setter', 'closer'))
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente')
    AND user_id IN (SELECT id FROM public.profiles WHERE role IN ('setter', 'closer'))
  );

-- 3. KPI entries — resp_vente peut lire pour setter/closer
CREATE POLICY "RespVente lit kpi_entries setter/closer" ON public.kpi_entries
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente')
    AND user_id IN (SELECT id FROM public.profiles WHERE role IN ('setter', 'closer'))
  );

-- 4. Tâches — resp_vente peut tout gérer pour setter/closer
CREATE POLICY "RespVente gère tâches setter/closer" ON public.tasks
  FOR ALL
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente')
    AND (
      created_by = auth.uid()
      OR user_id IN (SELECT id FROM public.profiles WHERE role IN ('setter', 'closer'))
    )
  )
  WITH CHECK (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente')
    AND user_id IN (SELECT id FROM public.profiles WHERE role IN ('setter', 'closer'))
  );

-- 5. Rapports EOD — resp_vente peut lire pour setter/closer
CREATE POLICY "RespVente lit eod_reports setter/closer" ON public.end_of_day_reports
  FOR SELECT
  USING (
    EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente')
    AND user_id IN (SELECT id FROM public.profiles WHERE role IN ('setter', 'closer'))
  );
