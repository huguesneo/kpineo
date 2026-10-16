-- Setting v2 : trace des leads remis dans la liste commune (« Rendre disponible
-- aux autres setters » ou admin). Le cycle ne réattribue pas automatiquement un
-- lead libéré depuis son étape « Contact établi » ; seule une nouvelle
-- conversation (appel de 60 s ou plus après la libération) le réattribue.
-- Purement additif. Annulation : supabase/rollback/20261016e_setting_liberations_rollback.sql
CREATE TABLE IF NOT EXISTS public.setting_liberations (
  contact_id  text PRIMARY KEY,
  libere_le   timestamptz NOT NULL DEFAULT now(),
  libere_par  uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  ancien_user uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
ALTER TABLE public.setting_liberations ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_liberations_read" ON public.setting_liberations;
CREATE POLICY "setting_liberations_read" ON public.setting_liberations
  FOR SELECT TO authenticated USING (public.is_vente_ou_admin());
