-- =============================================
-- Ajout du scope clinique aux objectives et kpi_entries
-- =============================================

-- Rendre user_id nullable (pour les entrées clinique)
ALTER TABLE public.objectives ALTER COLUMN user_id DROP NOT NULL;
ALTER TABLE public.kpi_entries ALTER COLUMN user_id DROP NOT NULL;

-- Ajouter la colonne scope
ALTER TABLE public.objectives ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE public.objectives ADD CONSTRAINT objectives_scope_check CHECK (scope IN ('individual', 'clinic'));

ALTER TABLE public.kpi_entries ADD COLUMN IF NOT EXISTS scope TEXT NOT NULL DEFAULT 'individual';
ALTER TABLE public.kpi_entries ADD CONSTRAINT kpi_entries_scope_check CHECK (scope IN ('individual', 'clinic'));

-- =============================================
-- Mettre à jour les policies membres pour inclure les entrées clinique
-- =============================================

DROP POLICY IF EXISTS "Membre lit ses propres objectifs" ON public.objectives;
CREATE POLICY "Membre lit ses objectifs ou clinique" ON public.objectives
  FOR SELECT USING (user_id = auth.uid() OR scope = 'clinic');

DROP POLICY IF EXISTS "Membre lit ses propres KPIs" ON public.kpi_entries;
CREATE POLICY "Membre lit ses KPIs ou clinique" ON public.kpi_entries
  FOR SELECT USING (user_id = auth.uid() OR scope = 'clinic');
