-- Setting v2 : notes ajoutées depuis la fiche du lead (envoyées dans GHL quand
-- l'interrupteur le permet ; sinon gardées dans l'app seulement), et liste des
-- profils qui ne reçoivent jamais de lead par la règle des 60 s (Brice, Pascal).
-- Purement additif. Annulation : supabase/rollback/20261016c_setting_notes_rollback.sql

CREATE TABLE IF NOT EXISTS public.setting_notes (
  id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id   text NOT NULL,
  user_id      uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  texte        text NOT NULL,
  ghl_note_id  text,                     -- null : pas envoyée dans GHL (écritures désactivées)
  cree_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setting_notes_contact ON public.setting_notes (contact_id, cree_le DESC);

ALTER TABLE public.setting_notes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_notes_read" ON public.setting_notes;
CREATE POLICY "setting_notes_read" ON public.setting_notes
  FOR SELECT TO authenticated USING (public.is_vente_ou_admin());

INSERT INTO public.setting_config (cle, valeur)
SELECT 'proprietaires_exclus', COALESCE(jsonb_agg(id), '[]'::jsonb)
FROM public.profiles WHERE full_name IN ('Brice NEO', 'Pascal NEO')
ON CONFLICT (cle) DO NOTHING;
