-- Espace de vente v2 : journal des confirmations manuelles de rencontres découverte
-- (bouton « Confirmer la rencontre » des setters, « Confirmer manuellement » des closeurs).
-- Une ligne par confirmation : qui, quand, quel RDV ; annule_le rempli si elle est retirée.
-- Écrit seulement par l'edge function ghl-confirmer-rencontre (clé service) ; lu par l'app
-- pour afficher « Confirmé par Maude » et n'offrir « Annuler la confirmation » que pour
-- une confirmation faite depuis le hub (jamais pour un lead qui a cliqué « Je confirme »).
-- Purement additif : aucune table existante n'est modifiée.

CREATE TABLE IF NOT EXISTS public.v2_confirmations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  appointment_id   text NOT NULL,           -- ghl_appointments.ghl_id
  contact_id       text NOT NULL,
  confirme_par     uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  confirme_par_nom text,
  confirme_le      timestamptz NOT NULL DEFAULT now(),
  annule_par       uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  annule_par_nom   text,
  annule_le        timestamptz
);

-- Au plus une confirmation active par RDV
CREATE UNIQUE INDEX IF NOT EXISTS uq_v2_confirmations_active
  ON public.v2_confirmations (appointment_id) WHERE annule_le IS NULL;

CREATE INDEX IF NOT EXISTS idx_v2_confirmations_contact
  ON public.v2_confirmations (contact_id);

ALTER TABLE public.v2_confirmations ENABLE ROW LEVEL SECURITY;

-- Équipe de vente et admins : rôle principal OU secondaire parmi admin, resp_vente,
-- setter, closer (même règle que modesDuProfil dans l'app). is_sales_role() ne
-- regarde pas les rôles secondaires, d'où cette fonction.
CREATE OR REPLACE FUNCTION public.is_vente_ou_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE id = auth.uid()
      AND (role IN ('admin', 'resp_vente', 'setter', 'closer')
           OR COALESCE(secondary_roles, '{}') && ARRAY['admin', 'resp_vente', 'setter', 'closer']::text[])
  );
$$;

REVOKE ALL ON FUNCTION public.is_vente_ou_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_vente_ou_admin() TO authenticated;

-- Lecture : vente et admins seulement (un compte connecté hors équipe ne voit rien).
-- Aucune règle d'écriture : seule la clé service de l'edge function écrit.
DROP POLICY IF EXISTS "v2_confirmations_read" ON public.v2_confirmations;
CREATE POLICY "v2_confirmations_read" ON public.v2_confirmations
  FOR SELECT TO authenticated USING (public.is_vente_ou_admin());

-- Realtime : l'agenda closeur et la file « À confirmer » bougent sans recharger
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'v2_confirmations') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.v2_confirmations;
  END IF;
END $$;
