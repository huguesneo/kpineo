-- Imitation minimale de Supabase (rôles, auth.jwt(), storage, publication)
-- pour tester 20261001e_montage_video.sql dans un Postgres local vide.
-- Ne jamais exécuter sur un vrai projet Supabase.
-- Les rôles sont partagés par tout le serveur : on ne les crée qu'une fois
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN CREATE ROLE anon NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN CREATE ROLE authenticated NOLOGIN; END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'service_role') THEN CREATE ROLE service_role NOLOGIN BYPASSRLS; END IF;
END $$;
CREATE SCHEMA auth; CREATE SCHEMA storage;
CREATE FUNCTION auth.jwt() RETURNS jsonb LANGUAGE sql STABLE AS
$$ SELECT COALESCE(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb $$;
CREATE TABLE storage.buckets (id text PRIMARY KEY, name text, public boolean, file_size_limit bigint, allowed_mime_types text[]);
CREATE TABLE storage.objects (id uuid PRIMARY KEY DEFAULT gen_random_uuid(), bucket_id text, name text);
CREATE FUNCTION storage.foldername(name text) RETURNS text[] LANGUAGE sql IMMUTABLE AS
$$ SELECT (string_to_array(name, '/'))[1:array_length(string_to_array(name,'/'),1)-1] $$;
ALTER TABLE storage.objects ENABLE ROW LEVEL SECURITY;
CREATE PUBLICATION supabase_realtime;
-- is_hugues() telle que définie dans 20260609_performance_reer.sql
CREATE OR REPLACE FUNCTION public.is_hugues()
RETURNS BOOLEAN AS $$
  SELECT COALESCE(auth.jwt() ->> 'email', '') = 'hugues@neoperformance.ca';
$$ LANGUAGE sql STABLE;
GRANT USAGE ON SCHEMA auth, storage, public TO anon, authenticated, service_role;
GRANT ALL ON ALL TABLES IN SCHEMA storage TO anon, authenticated, service_role;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO anon, authenticated, service_role;
