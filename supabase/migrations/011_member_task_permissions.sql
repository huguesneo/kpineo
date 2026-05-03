-- Membres peuvent créer leurs propres tâches
CREATE POLICY "Membre peut créer ses propres tâches" ON public.tasks
  FOR INSERT
  WITH CHECK (
    user_id = auth.uid()
    AND created_by = auth.uid()
  );

-- Membres peuvent supprimer uniquement les tâches qu'ils ont eux-mêmes créées
CREATE POLICY "Membre peut supprimer ses propres tâches" ON public.tasks
  FOR DELETE
  USING (
    user_id = auth.uid()
    AND created_by = auth.uid()
  );
