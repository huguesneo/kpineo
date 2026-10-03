-- Espace de vente v2 (écran setter « Ma journée »)
-- 1. lead_locks : verrou de 15 min sur un lead pris par un setter
-- 2. v2_call_attempts : journal des « Appelé, pas de réponse » (compteur du jour)
-- 3. Realtime sur le cache GHL pour que les files bougent sans recharger
-- Purement additif : aucune table existante n'est modifiée.

CREATE TABLE IF NOT EXISTS public.lead_locks (
  contact_id text PRIMARY KEY,
  user_id    uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  locked_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.lead_locks ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "lead_locks_read" ON public.lead_locks;
CREATE POLICY "lead_locks_read" ON public.lead_locks
  FOR SELECT TO authenticated USING (true);

-- Écriture : seulement sa propre ligne. Un verrou échu (> 15 min) d'un autre
-- setter peut être repris : l'app le supprime puis insère le sien, d'où la
-- règle de suppression sur les verrous expirés.
DROP POLICY IF EXISTS "lead_locks_insert_own" ON public.lead_locks;
CREATE POLICY "lead_locks_insert_own" ON public.lead_locks
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lead_locks_update_own" ON public.lead_locks;
CREATE POLICY "lead_locks_update_own" ON public.lead_locks
  FOR UPDATE TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "lead_locks_delete_own_or_expired" ON public.lead_locks;
CREATE POLICY "lead_locks_delete_own_or_expired" ON public.lead_locks
  FOR DELETE TO authenticated
  USING (user_id = auth.uid() OR locked_at < now() - interval '15 minutes');

CREATE TABLE IF NOT EXISTS public.v2_call_attempts (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id     text NOT NULL,
  opportunity_id text,
  attempt        integer,
  note           text,
  created_at     timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_v2_call_attempts_user_date
  ON public.v2_call_attempts (user_id, created_at);

ALTER TABLE public.v2_call_attempts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "v2_call_attempts_read" ON public.v2_call_attempts;
CREATE POLICY "v2_call_attempts_read" ON public.v2_call_attempts
  FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "v2_call_attempts_insert_own" ON public.v2_call_attempts;
CREATE POLICY "v2_call_attempts_insert_own" ON public.v2_call_attempts
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

-- Realtime
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ghl_opportunities') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ghl_opportunities;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'ghl_appointments') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.ghl_appointments;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = 'lead_locks') THEN
    ALTER PUBLICATION supabase_realtime ADD TABLE public.lead_locks;
  END IF;
END $$;
