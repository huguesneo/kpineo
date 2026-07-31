-- ============================================================================
-- Moteur d'analyse des réseaux sociaux
-- Mesure par publication, snapshots, scoring, rapports IA, expériences
-- ============================================================================

-- 1. Comptes sociaux connectés -----------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_accounts (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  platform          text NOT NULL CHECK (platform IN ('instagram','facebook','tiktok','google')),
  external_id       text NOT NULL,
  handle            text,
  display_name      text,
  followers_count   integer,
  metricool_blog_id integer,
  timezone          text NOT NULL DEFAULT 'America/Toronto',
  is_active         boolean NOT NULL DEFAULT true,
  last_synced_at    timestamptz,
  last_sync_error   text,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, external_id)
);

-- 2. Le pont : une publication native par plateforme --------------------------
-- post_id nullable : on capte aussi ce qui est publié hors de l'app.
CREATE TABLE IF NOT EXISTS public.social_publications (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  post_id           uuid REFERENCES public.social_posts(id) ON DELETE SET NULL,
  account_id        uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  platform          text NOT NULL,
  platform_post_id  text NOT NULL,
  permalink         text,
  media_type        text,
  caption           text,
  duration_seconds  numeric,
  published_at      timestamptz NOT NULL,
  publish_hour      smallint GENERATED ALWAYS AS
                      (EXTRACT(hour FROM published_at AT TIME ZONE 'America/Toronto')::smallint) STORED,
  publish_dow       smallint GENERATED ALWAYS AS
                      (EXTRACT(isodow FROM published_at AT TIME ZONE 'America/Toronto')::smallint) STORED,
  source            text NOT NULL DEFAULT 'meta_direct'
                      CHECK (source IN ('meta_direct','metricool','ghl','manuel')),
  match_status      text NOT NULL DEFAULT 'auto'
                      CHECK (match_status IN ('auto','manual','ambiguous','unlinked')),
  match_score       numeric,
  is_final          boolean NOT NULL DEFAULT false,
  created_at        timestamptz NOT NULL DEFAULT now(),
  UNIQUE (platform, platform_post_id)
);
CREATE INDEX IF NOT EXISTS social_pub_published_idx ON public.social_publications (published_at DESC);
CREATE INDEX IF NOT EXISTS social_pub_post_idx      ON public.social_publications (post_id);
CREATE INDEX IF NOT EXISTS social_pub_match_idx     ON public.social_publications (match_status)
  WHERE match_status IN ('ambiguous','unlinked');

-- 3. Snapshots de métriques — append-only, jamais d'UPDATE destructif ---------
CREATE TABLE IF NOT EXISTS public.social_metric_snapshots (
  id                 bigserial PRIMARY KEY,
  publication_id     uuid NOT NULL REFERENCES public.social_publications(id) ON DELETE CASCADE,
  captured_at        timestamptz NOT NULL DEFAULT now(),
  age_hours          numeric NOT NULL,
  window_tag         text CHECK (window_tag IN ('d1','d3','d7','d28')),
  reach              integer,
  views              integer,
  likes              integer,
  comments           integer,
  saves              integer,
  shares             integer,
  total_interactions integer,
  profile_visits     integer,
  follows            integer,
  link_clicks        integer,
  avg_watch_time_s   numeric,
  total_watch_time_s numeric,
  view_rate_3s       numeric,   -- % ayant regardé > 3 s (hook rate)
  full_watch_rate    numeric,
  raw                jsonb NOT NULL,
  created_at         timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS social_snap_window_uniq
  ON public.social_metric_snapshots (publication_id, window_tag)
  WHERE window_tag IS NOT NULL;
CREATE INDEX IF NOT EXISTS social_snap_pub_idx
  ON public.social_metric_snapshots (publication_id, captured_at DESC);

-- 4. Scores calculés sur la fenêtre canonique J+7 -----------------------------
CREATE TABLE IF NOT EXISTS public.social_post_scores (
  publication_id uuid PRIMARY KEY REFERENCES public.social_publications(id) ON DELETE CASCADE,
  er_reach       numeric,
  save_rate      numeric,
  share_rate     numeric,
  follow_rate    numeric,
  profile_ctr    numeric,
  watch_through  numeric,
  pi_reach       numeric,
  pi_save        numeric,
  pi_share       numeric,
  pi_follow      numeric,
  pi_watch       numeric,
  score          numeric,
  baseline_n     integer,
  verdict        text CHECK (verdict IN ('surperforme','normal','sous_performe','insuffisant')),
  computed_at    timestamptz NOT NULL DEFAULT now()
);

-- 5. Snapshots au niveau compte ----------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_account_snapshots (
  id            bigserial PRIMARY KEY,
  account_id    uuid NOT NULL REFERENCES public.social_accounts(id) ON DELETE CASCADE,
  snapshot_date date NOT NULL,
  followers     integer,
  reach         integer,
  views         integer,
  non_follower_view_share numeric,
  profile_views integer,
  raw           jsonb,
  UNIQUE (account_id, snapshot_date)
);

-- 6. Rapports IA hebdomadaires ------------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_ai_reports (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  week_start date NOT NULL,
  week_end   date NOT NULL,
  model      text,
  payload_in jsonb,
  report     jsonb NOT NULL,
  markdown   text,
  read_at    timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (week_start)
);

-- 7. Expériences (garde-fou méthodologique) -----------------------------------
CREATE TABLE IF NOT EXISTS public.social_experiments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name            text NOT NULL,
  variable        text NOT NULL,
  variants        text[] NOT NULL,
  decision_metric text NOT NULL,
  min_n_per_arm   integer NOT NULL DEFAULT 16,
  started_at      timestamptz NOT NULL DEFAULT now(),
  ended_at        timestamptz,
  status          text NOT NULL DEFAULT 'en_cours'
                    CHECK (status IN ('en_cours','conclu','abandonne')),
  conclusion      text,
  replication_of  uuid REFERENCES public.social_experiments(id)
);

-- 8. Publications des concurrents ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.social_competitor_posts (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  network          text NOT NULL,
  competitor       text NOT NULL,
  platform_post_id text,
  published_at     timestamptz,
  caption          text,
  reach            integer,
  interactions     integer,
  engagement_rate  numeric,
  raw              jsonb NOT NULL,
  captured_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (network, platform_post_id)
);

-- 9. Tagging de contenu sur social_posts --------------------------------------
ALTER TABLE public.social_posts
  ADD COLUMN IF NOT EXISTS hook_type        text,
  ADD COLUMN IF NOT EXISTS audience_problem text,
  ADD COLUMN IF NOT EXISTS proof_method     text,
  ADD COLUMN IF NOT EXISTS seo_keyword      text,
  ADD COLUMN IF NOT EXISTS is_trial         boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS experiment_id    uuid REFERENCES public.social_experiments(id),
  ADD COLUMN IF NOT EXISTS experiment_arm   text;

-- 10. RLS — même politique que le reste du module ------------------------------
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY[
    'social_accounts','social_publications','social_metric_snapshots',
    'social_post_scores','social_account_snapshots','social_ai_reports',
    'social_experiments','social_competitor_posts'
  ] LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', t);
    EXECUTE format('DROP POLICY IF EXISTS %I_all ON public.%I', t, t);
    EXECUTE format(
      'CREATE POLICY %I_all ON public.%I FOR ALL
         USING (public.has_social_access())
         WITH CHECK (public.has_social_access())', t, t);
  END LOOP;
END $$;
