-- Setting v2 (meeting de vente du 9 oct. 2026) : résultat de l'appel, fiche,
-- rappels, propriété des leads (règle des 60 s), tâches automatiques.
-- Purement additif : nouvelles tables, deux colonnes nullables sur
-- setter_shared_tasks, une fonction, un cron. Annulation :
-- supabase/rollback/20261016a_setting_v2_rollback.sql
--
-- Règles d'accès : aucune table n'accepte d'écriture du navigateur, sauf
-- setting_taches (le setter marque SES tâches vues ou faites) et le réglage
-- des écritures GHL (admin seulement). Tout le reste est écrit par les edge
-- functions setting-actions et setting-cycle (clé service).

-- ── Réglages ────────────────────────────────────────────────────────────────
-- ecritures_ghl_reelles : false = l'app n'écrit dans GHL que pour le contact
-- test (hugues.pugliese@gmail.com) ; pour les autres, l'action est enregistrée
-- dans l'app seulement (« simulée »). Interrupteur réservé à l'admin.
CREATE TABLE IF NOT EXISTS public.setting_config (
  cle        text PRIMARY KEY,
  valeur     jsonb NOT NULL,
  maj_le     timestamptz NOT NULL DEFAULT now(),
  maj_par    uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
INSERT INTO public.setting_config (cle, valeur) VALUES
  ('ecritures_ghl_reelles', 'false'::jsonb),
  ('contact_test_email', '"hugues.pugliese@gmail.com"'::jsonb)
ON CONFLICT (cle) DO NOTHING;

ALTER TABLE public.setting_config ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_config_read" ON public.setting_config;
CREATE POLICY "setting_config_read" ON public.setting_config
  FOR SELECT TO authenticated USING (public.is_vente_ou_admin());
DROP POLICY IF EXISTS "setting_config_admin_update" ON public.setting_config;
CREATE POLICY "setting_config_admin_update" ON public.setting_config
  FOR UPDATE TO authenticated
  USING (public.is_admin() AND cle = 'ecritures_ghl_reelles')
  WITH CHECK (public.is_admin() AND cle = 'ecritures_ghl_reelles');

-- ── Journal d'appels (copie en lecture seule du journal GHL) ────────────────
-- Rempli toutes les 2 min par setting-cycle (GET /conversations/messages/export).
-- Lisible par l'équipe de vente : l'avertissement « Appelé par Vicky il y a 3 h »
-- et la date de la dernière tentative servent à tous les setters.
CREATE TABLE IF NOT EXISTS public.setting_appels (
  id              text PRIMARY KEY,            -- id du message GHL
  contact_id      text NOT NULL,
  conversation_id text,
  ghl_user_id     text,
  user_id         uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  sortant         boolean NOT NULL DEFAULT true,
  statut          text,
  duree           integer,                     -- secondes
  appele_le       timestamptz NOT NULL,
  importe_le      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setting_appels_contact ON public.setting_appels (contact_id, appele_le DESC);
CREATE INDEX IF NOT EXISTS idx_setting_appels_date ON public.setting_appels (appele_le DESC);

ALTER TABLE public.setting_appels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_appels_read" ON public.setting_appels;
CREATE POLICY "setting_appels_read" ON public.setting_appels
  FOR SELECT TO authenticated USING (public.is_vente_ou_admin());

-- ── Propriété des leads ─────────────────────────────────────────────────────
-- Une ligne = un lead assigné à un setter (appel de 60 s ou plus, rappel créé,
-- ou réassignation par l'admin). Supprimée quand le lead revient dans la liste
-- commune (3 jours ouvrables sans action). Lisible par l'équipe de vente :
-- les autres setters doivent savoir que le lead n'est plus dans la liste commune.
CREATE TABLE IF NOT EXISTS public.setting_proprietes (
  contact_id      text PRIMARY KEY,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  origine         text NOT NULL CHECK (origine IN ('appel_60s', 'rappel', 'admin')),
  depuis          timestamptz NOT NULL DEFAULT now(),
  derniere_action timestamptz NOT NULL DEFAULT now(),
  assigne_par     uuid REFERENCES public.profiles(id) ON DELETE SET NULL
);
CREATE INDEX IF NOT EXISTS idx_setting_proprietes_user ON public.setting_proprietes (user_id);

ALTER TABLE public.setting_proprietes ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_proprietes_read" ON public.setting_proprietes;
CREATE POLICY "setting_proprietes_read" ON public.setting_proprietes
  FOR SELECT TO authenticated USING (public.is_vente_ou_admin());

-- ── Rappels (« Mettre en rappel ») ──────────────────────────────────────────
-- Privés : un setter ne voit que les siens ; l'admin et la resp. vente voient tout.
CREATE TABLE IF NOT EXISTS public.setting_rappels (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      text NOT NULL,
  opportunity_id  text,
  contact_nom     text,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  rappel_le       timestamptz NOT NULL,
  note            text,
  statut          text NOT NULL DEFAULT 'actif' CHECK (statut IN ('actif', 'fait', 'annule')),
  ghl_simule      boolean NOT NULL DEFAULT true,  -- tag/champ réellement posés dans GHL ?
  tag_retire_le   timestamptz,
  cree_le         timestamptz NOT NULL DEFAULT now(),
  termine_le      timestamptz
);
CREATE INDEX IF NOT EXISTS idx_setting_rappels_user ON public.setting_rappels (user_id, statut, rappel_le);
CREATE INDEX IF NOT EXISTS idx_setting_rappels_contact ON public.setting_rappels (contact_id, statut);

ALTER TABLE public.setting_rappels ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_rappels_read" ON public.setting_rappels;
CREATE POLICY "setting_rappels_read" ON public.setting_rappels
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin()
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente'));

-- ── Résultats d'appel (Non qualifié / Pas intéressé / Rendez-vous booké) ─────
-- Un setter voit les siens ; l'admin et la resp. vente voient tout (compteur
-- « Non qualifiés par source »). source/canal : copie au moment du résultat.
CREATE TABLE IF NOT EXISTS public.setting_resultats (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contact_id      text NOT NULL,
  opportunity_id  text,
  contact_nom     text,
  user_id         uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  resultat        text NOT NULL CHECK (resultat IN ('rdv_booke', 'non_qualifie', 'pas_interesse')),
  raison          text CHECK (raison IS NULL OR raison IN ('age', 'hors_cible', 'mauvais_numero', 'autre')),
  raison_texte    text,
  source          text,
  canal           text,
  ghl_simule      boolean NOT NULL DEFAULT true,
  cree_le         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setting_resultats_contact ON public.setting_resultats (contact_id, cree_le DESC);
CREATE INDEX IF NOT EXISTS idx_setting_resultats_date ON public.setting_resultats (resultat, cree_le DESC);

ALTER TABLE public.setting_resultats ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_resultats_read" ON public.setting_resultats;
CREATE POLICY "setting_resultats_read" ON public.setting_resultats
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_admin()
         OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'resp_vente'));

-- Contacts sortis de la liste par un résultat (ids seulement, sans raison ni
-- auteur) : chaque setter doit pouvoir les masquer de sa liste.
CREATE OR REPLACE FUNCTION public.setting_contacts_traites(p_jours integer DEFAULT 90)
RETURNS TABLE (contact_id text, resultat text, cree_le timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  SELECT DISTINCT ON (r.contact_id) r.contact_id, r.resultat, r.cree_le
  FROM public.setting_resultats r
  WHERE public.is_vente_ou_admin()
    AND r.resultat IN ('non_qualifie', 'pas_interesse')
    AND r.cree_le > now() - make_interval(days => LEAST(GREATEST(p_jours, 1), 365))
  ORDER BY r.contact_id, r.cree_le DESC;
$$;
REVOKE ALL ON FUNCTION public.setting_contacts_traites(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setting_contacts_traites(integer) TO authenticated;

-- Compteur admin « Non qualifiés par source » : leads passés à l'étape
-- « 🗑️ Non qualifié » du pipeline setting dans les p_jours derniers jours
-- (GHL), plus les « Non qualifié » enregistrés dans l'app (dont les simulés).
-- Canal : tags canal-meta-ads / canal-organique / canal-inconnu. Source :
-- champ cycle_utm_source (id résolu par setting-cycle dans setting_config),
-- sinon utm_source du cache. Réservé à l'admin.
CREATE OR REPLACE FUNCTION public.setting_nq_par_source(p_jours integer DEFAULT 30)
RETURNS TABLE (canal text, source text, nb bigint)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
  WITH champ AS (
    SELECT valeur #>> '{}' AS id FROM public.setting_config WHERE cle = 'champ_cycle_utm_source'
  ),
  depuis AS (SELECT now() - make_interval(days => LEAST(GREATEST(p_jours, 1), 365)) AS d),
  nq AS (
    SELECT o.contact_id FROM public.ghl_opportunities o, depuis
    WHERE o.pipeline_id = 'KkPiFjw0ztAXc7z6Ab9c'
      AND o.pipeline_stage_id = '7d0ce220-cb62-45e8-8484-3392ce774061'
      AND COALESCE((o.raw->>'lastStageChangeAt')::timestamptz, o.created_at_ghl) >= depuis.d
    UNION
    SELECT r.contact_id FROM public.setting_resultats r, depuis
    WHERE r.resultat = 'non_qualifie' AND r.cree_le >= depuis.d
  )
  SELECT
    CASE
      WHEN 'canal-meta-ads'  = ANY(c.tags) THEN 'canal-meta-ads'
      WHEN 'canal-organique' = ANY(c.tags) THEN 'canal-organique'
      WHEN 'canal-inconnu'   = ANY(c.tags) THEN 'canal-inconnu'
      ELSE 'sans tag canal'
    END AS canal,
    COALESCE(NULLIF((
      SELECT cf->>'value' FROM jsonb_array_elements(COALESCE(c.raw->'customFields', '[]'::jsonb)) cf, champ
      WHERE cf->>'id' = champ.id LIMIT 1
    ), ''), NULLIF(c.utm_source, ''), '(aucune)') AS source,
    count(*) AS nb
  FROM nq LEFT JOIN public.ghl_contacts c ON c.ghl_id = nq.contact_id
  WHERE public.is_admin()
  GROUP BY 1, 2
  ORDER BY 3 DESC;
$$;
REVOKE ALL ON FUNCTION public.setting_nq_par_source(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.setting_nq_par_source(integer) TO authenticated;

-- ── Tâches automatiques ─────────────────────────────────────────────────────
-- Créées par setting-cycle pour le setter concerné. user_id NULL = tâche
-- d'équipe (no-show/annulation sans setter connu), visible par la vente.
CREATE TABLE IF NOT EXISTS public.setting_taches (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  cle             text NOT NULL UNIQUE,          -- anti-doublon (type:contact:référence)
  type            text NOT NULL CHECK (type IN ('rappel_du', 'inactif_2j', 'no_show', 'annulation')),
  user_id         uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_id      text NOT NULL,
  contact_nom     text,
  titre           text NOT NULL,
  detail          text,
  due_le          timestamptz NOT NULL DEFAULT now(),
  notifie_le      timestamptz,
  fait_le         timestamptz,
  cree_le         timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_setting_taches_user ON public.setting_taches (user_id, fait_le, due_le);

ALTER TABLE public.setting_taches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "setting_taches_read" ON public.setting_taches;
CREATE POLICY "setting_taches_read" ON public.setting_taches
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_vente_ou_admin()) OR public.is_admin());
-- Le setter marque ses tâches (ou celles d'équipe) vues / faites, rien d'autre
DROP POLICY IF EXISTS "setting_taches_update" ON public.setting_taches;
CREATE POLICY "setting_taches_update" ON public.setting_taches
  FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR (user_id IS NULL AND public.is_vente_ou_admin()))
  WITH CHECK (user_id = auth.uid() OR (user_id IS NULL AND public.is_vente_ou_admin()));

CREATE OR REPLACE FUNCTION public.setting_taches_garde()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  -- Depuis le navigateur, seuls notifie_le et fait_le peuvent changer
  IF auth.role() = 'authenticated' THEN
    IF NEW.cle IS DISTINCT FROM OLD.cle OR NEW.type IS DISTINCT FROM OLD.type
       OR NEW.user_id IS DISTINCT FROM OLD.user_id OR NEW.contact_id IS DISTINCT FROM OLD.contact_id
       OR NEW.titre IS DISTINCT FROM OLD.titre OR NEW.detail IS DISTINCT FROM OLD.detail
       OR NEW.due_le IS DISTINCT FROM OLD.due_le OR NEW.cree_le IS DISTINCT FROM OLD.cree_le
       OR NEW.contact_nom IS DISTINCT FROM OLD.contact_nom THEN
      RAISE EXCEPTION 'Seuls notifie_le et fait_le sont modifiables';
    END IF;
  END IF;
  RETURN NEW;
END $$;
DROP TRIGGER IF EXISTS trg_setting_taches_garde ON public.setting_taches;
CREATE TRIGGER trg_setting_taches_garde BEFORE UPDATE ON public.setting_taches
  FOR EACH ROW EXECUTE FUNCTION public.setting_taches_garde();

-- ── Ménage des anciennes tâches setters : archivage (rien n'est supprimé) ──
ALTER TABLE public.setter_shared_tasks ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE public.setter_shared_tasks ADD COLUMN IF NOT EXISTS archived_reason text;

-- ── Realtime : les listes bougent sans recharger ────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['setting_appels', 'setting_proprietes', 'setting_rappels', 'setting_resultats', 'setting_taches'] LOOP
    IF NOT EXISTS (SELECT 1 FROM pg_publication_tables WHERE pubname = 'supabase_realtime' AND tablename = t) THEN
      EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I', t);
    END IF;
  END LOOP;
END $$;

-- ── Cron : setting-cycle toutes les 2 minutes ───────────────────────────────
-- Lit le journal d'appels GHL (lecture seule), assigne/libère les leads, crée
-- les tâches, retire le tag rappel-manuel à l'échéance (écriture GHL soumise
-- au même interrupteur que setting-actions). Ne reçoit aucune donnée.
SELECT cron.schedule(
  'setting-cycle',
  '*/2 * * * *',
  $$
    SELECT net.http_post(
      url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/setting-cycle',
      body    := '{}'::jsonb,
      headers := '{"Content-Type":"application/json"}'::jsonb
    );
  $$
);
