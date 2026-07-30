-- =============================================================================
-- Module Réseaux sociaux — planification + publication GHL + performances
-- Accès réservé : hugues@neoperformance.ca, cloe@neoperformance.ca (futur),
-- info@neoperformance.ca (compte actuel de Cloé)
-- =============================================================================

-- Fonction utilitaire : l'utilisateur courant a-t-il accès au module ?
CREATE OR REPLACE FUNCTION public.has_social_access()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER
AS $$
  SELECT (auth.jwt() ->> 'email') IN (
    'hugues@neoperformance.ca',
    'cloe@neoperformance.ca',
    'info@neoperformance.ca'
  );
$$;

-- Banque d'idées
CREATE TABLE IF NOT EXISTS public.social_ideas (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  title text NOT NULL,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Banque de hooks
CREATE TABLE IF NOT EXISTS public.social_hooks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  text text NOT NULL,
  style text,
  used boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Pipeline de contenu (de l'idée à la publication)
CREATE TABLE IF NOT EXISTS public.social_posts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  number integer,
  title text NOT NULL,
  hook text,
  sphere text,
  format text,
  intention text,
  cta text,
  status text NOT NULL DEFAULT 'idee'
    CHECK (status IN ('idee','montage','programme','publie')),
  scheduled_at timestamptz,
  published_at timestamptz,
  caption text,
  platforms text[] NOT NULL DEFAULT '{instagram,facebook}',
  media_urls text[] NOT NULL DEFAULT '{}',
  ghl_post_id text,
  script_url text,
  notes text,
  stats jsonb,
  stats_synced_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS social_posts_scheduled_idx ON public.social_posts (scheduled_at);
CREATE INDEX IF NOT EXISTS social_posts_status_idx    ON public.social_posts (status);

-- updated_at automatique
CREATE OR REPLACE FUNCTION public.social_posts_touch_updated_at()
RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS social_posts_touch ON public.social_posts;
CREATE TRIGGER social_posts_touch
  BEFORE UPDATE ON public.social_posts
  FOR EACH ROW EXECUTE FUNCTION public.social_posts_touch_updated_at();

-- RLS : accès complet pour les deux personnes autorisées, rien pour les autres
ALTER TABLE public.social_ideas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_hooks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.social_posts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS social_ideas_all ON public.social_ideas;
CREATE POLICY social_ideas_all ON public.social_ideas
  FOR ALL USING (public.has_social_access()) WITH CHECK (public.has_social_access());

DROP POLICY IF EXISTS social_hooks_all ON public.social_hooks;
CREATE POLICY social_hooks_all ON public.social_hooks
  FOR ALL USING (public.has_social_access()) WITH CHECK (public.has_social_access());

DROP POLICY IF EXISTS social_posts_all ON public.social_posts;
CREATE POLICY social_posts_all ON public.social_posts
  FOR ALL USING (public.has_social_access()) WITH CHECK (public.has_social_access());

-- Bucket de stockage des médias (images/vidéos à publier)
INSERT INTO storage.buckets (id, name, public)
VALUES ('social-media', 'social-media', true)
ON CONFLICT (id) DO NOTHING;

DROP POLICY IF EXISTS social_media_read ON storage.objects;
CREATE POLICY social_media_read ON storage.objects
  FOR SELECT USING (bucket_id = 'social-media');

DROP POLICY IF EXISTS social_media_write ON storage.objects;
CREATE POLICY social_media_write ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'social-media' AND public.has_social_access());

DROP POLICY IF EXISTS social_media_update ON storage.objects;
CREATE POLICY social_media_update ON storage.objects
  FOR UPDATE USING (bucket_id = 'social-media' AND public.has_social_access());

DROP POLICY IF EXISTS social_media_delete ON storage.objects;
CREATE POLICY social_media_delete ON storage.objects
  FOR DELETE USING (bucket_id = 'social-media' AND public.has_social_access());
