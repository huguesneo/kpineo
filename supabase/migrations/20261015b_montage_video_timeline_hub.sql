-- =============================================================================
-- Module Montage vidéo : timeline du hub, catalogue et polices (15 oct. 2026)
-- =============================================================================
-- Additif, après 20261015a. L'agent publie dans le bucket privé video-timeline :
--   hub/catalogue.json   catalogue de la palette (types, graphiques, styles, limites d'éléments)
--   hub/polices/<f>.otf  polices des graphiques (versions d'essai : jamais dans git ni dans le build Netlify)
-- Le hub les lit par lien signé, après connexion seulement (has_montage_access()).
-- Seuls changements : 2 types de fichiers acceptés en plus, et le dossier hub/ ajouté à la lecture.
-- Retour : supabase/retours/20261015b_montage_video_timeline_hub_retour.sql

BEGIN;

UPDATE storage.buckets
   SET allowed_mime_types =
         ARRAY['video/mp4','image/png','application/json','audio/mpeg','audio/wav','audio/x-wav','audio/mp4',
               'audio/aac','audio/ogg','audio/flac','audio/aiff','audio/x-aiff','font/otf','font/ttf']
 WHERE id = 'video-timeline';

DROP POLICY IF EXISTS video_timeline_read ON storage.objects;
CREATE POLICY video_timeline_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-timeline'
    AND public.has_montage_access()
    AND (storage.foldername(name))[1] IN ('montages', 'sons', 'hub'));

COMMIT;
