-- Les membres authentifiés peuvent lire tous les profils
-- (nécessaire pour afficher "Créée par X" sur les tâches)
CREATE POLICY "Tous les membres voient tous les profils" ON public.profiles
  FOR SELECT TO authenticated USING (true);
