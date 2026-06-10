-- =============================================================================
-- REER étape 2 : cotisation du naturo + pièce jointe + confirmation NEO
-- =============================================================================

-- 1) Bucket privé pour les preuves de cotisation (bordereaux/relevés)
INSERT INTO storage.buckets (id, name, public)
VALUES ('reer-proofs', 'reer-proofs', false)
ON CONFLICT (id) DO NOTHING;

-- Permissions sur les fichiers : chaque naturo gère son dossier {naturo_key}/...,
-- Hugues gère tout.
DROP POLICY IF EXISTS "naturo gère ses preuves" ON storage.objects;
CREATE POLICY "naturo gère ses preuves" ON storage.objects
  FOR ALL
  USING (bucket_id = 'reer-proofs' AND (storage.foldername(name))[1] = public.my_naturo_key())
  WITH CHECK (bucket_id = 'reer-proofs' AND (storage.foldername(name))[1] = public.my_naturo_key());

DROP POLICY IF EXISTS "hugues gère les preuves" ON storage.objects;
CREATE POLICY "hugues gère les preuves" ON storage.objects
  FOR ALL
  USING (bucket_id = 'reer-proofs' AND public.is_hugues())
  WITH CHECK (bucket_id = 'reer-proofs' AND public.is_hugues());

-- 2) Suivi de soumission / confirmation
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS contrib_submitted_at timestamptz;
ALTER TABLE public.neo_naturo_monthly ADD COLUMN IF NOT EXISTS neo_confirmed_at timestamptz;

-- 3) RPC : le naturo soumet SA cotisation + le chemin de sa preuve.
--    SECURITY DEFINER → écrit uniquement sa propre ligne, colonnes contrôlées.
CREATE OR REPLACE FUNCTION public.submit_my_contribution(
  p_year int, p_month int, p_montant numeric, p_proof_path text
) RETURNS void AS $$
DECLARE k text;
BEGIN
  k := public.my_naturo_key();
  IF k IS NULL THEN RAISE EXCEPTION 'Aucun naturo lié à ce compte'; END IF;

  UPDATE public.neo_naturo_monthly
     SET montant_naturo = p_montant,
         proof_path = COALESCE(p_proof_path, proof_path),
         contrib_submitted_at = now(),
         neo_confirmed_at = NULL,
         eligible = (COALESCE(plancher_atteint, false) AND COALESCE(marge_ok, false) AND p_montant > 0)
   WHERE naturo_key = k AND year = p_year AND month = p_month AND visible = true;

  IF NOT FOUND THEN RAISE EXCEPTION 'Mois non disponible pour ce naturo'; END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4) Active le temps réel sur les instantanés (notification admin live).
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    IF NOT EXISTS (
      SELECT 1 FROM pg_publication_tables
      WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'neo_naturo_monthly'
    ) THEN
      ALTER PUBLICATION supabase_realtime ADD TABLE public.neo_naturo_monthly;
    END IF;
  END IF;
END $$;
