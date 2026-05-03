-- Récurrence des tâches
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS recurrence_rule JSONB DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS recurrence_parent_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS recurrence_index INTEGER DEFAULT 0;

-- Permet aux membres de créer la prochaine instance d'une tâche récurrente
-- (quand ils complètent une tâche récurrente, le client génère la suivante)
CREATE POLICY "Membre peut continuer ses récurrences" ON public.tasks
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND recurrence_parent_id IS NOT NULL
  );
