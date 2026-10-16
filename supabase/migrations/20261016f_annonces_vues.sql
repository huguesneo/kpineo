-- Démos guidées des mises à jour (« Mise à jour importante · Voir la démo ») :
-- qui a vu quelle démo. Chacun lit et marque seulement les siennes ; l'admin
-- voit tout (qui a regardé). Purement additif.
-- Annulation : supabase/rollback/20261016f_annonces_vues_rollback.sql
CREATE TABLE IF NOT EXISTS public.app_annonces_vues (
  user_id   uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  annonce   text NOT NULL,              -- ex. 'setting-v2-setter', 'setting-v2-closeur'
  vu_le     timestamptz NOT NULL DEFAULT now(),
  terminee  boolean NOT NULL DEFAULT false,  -- démo suivie jusqu'au bout
  PRIMARY KEY (user_id, annonce)
);
ALTER TABLE public.app_annonces_vues ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "annonces_vues_read" ON public.app_annonces_vues;
CREATE POLICY "annonces_vues_read" ON public.app_annonces_vues
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_admin());
DROP POLICY IF EXISTS "annonces_vues_insert" ON public.app_annonces_vues;
CREATE POLICY "annonces_vues_insert" ON public.app_annonces_vues
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
DROP POLICY IF EXISTS "annonces_vues_update" ON public.app_annonces_vues;
CREATE POLICY "annonces_vues_update" ON public.app_annonces_vues
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
