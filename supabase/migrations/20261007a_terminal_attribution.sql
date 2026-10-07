-- Terminal : attribution de la vente (closeur, setter, naturopathe) et bouton « Annuler »
--
-- Attribution : choisie dans le terminal avant d'encaisser (obligatoire pour tous).
--   closer_id / closer_name  = le closeur choisi (et non plus la personne connectée)
--   created_by               = la personne qui a saisi la vente
--   setter_id / therapist_id = profils choisis (NULL = « Aucun »)
--   attribution_confirmed_at = les trois choix ont été faits : le reçu QuickBooks
--                              utilise ces noms tels quels, sans chercher dans GHL.
--
-- Annuler le paiement : prélèvements arrêtés chez Moneris, le client reste dans son programme.
-- Retirer : vente saisie par erreur (0 $ encaissé), cachée des listes, jamais effacée.

ALTER TABLE public.payment_plans
  ADD COLUMN IF NOT EXISTS created_by               UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS setter_id                UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS therapist_id             UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS attribution_confirmed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payments_stopped_at      TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS payments_stopped_by      UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS removed_at               TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS removed_by               UUID REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS removed_reason           TEXT;

-- La personne qui a saisi la vente pour un autre closeur la voit aussi
DROP POLICY IF EXISTS "Terminal lit plans saisis" ON public.payment_plans;
CREATE POLICY "Terminal lit plans saisis" ON public.payment_plans
  FOR SELECT USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Terminal lit versements saisis" ON public.payment_installments;
CREATE POLICY "Terminal lit versements saisis" ON public.payment_installments
  FOR SELECT USING (
    EXISTS (SELECT 1 FROM public.payment_plans p WHERE p.id = plan_id AND p.created_by = auth.uid())
  );
