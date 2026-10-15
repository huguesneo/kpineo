-- =============================================================================
-- RETOUR EN ARRIÈRE de 20261015b_montage_video_timeline_hub.sql (jamais appliqué sans l'OK de Hugues)
-- =============================================================================
-- Remet la liste des types et la règle de lecture de 20261015a. Les fichiers hub/ restent dans le
-- bucket mais ne sont plus lisibles ; les effacer par l'API Storage (Supabase refuse en SQL).

BEGIN;

UPDATE storage.buckets
   SET allowed_mime_types =
         ARRAY['video/mp4','image/png','application/json','audio/mpeg','audio/wav','audio/x-wav','audio/mp4',
               'audio/aac','audio/ogg','audio/flac','audio/aiff','audio/x-aiff']
 WHERE id = 'video-timeline';

DROP POLICY IF EXISTS video_timeline_read ON storage.objects;
CREATE POLICY video_timeline_read ON storage.objects
  FOR SELECT USING (
    bucket_id = 'video-timeline'
    AND public.has_montage_access()
    AND (storage.foldername(name))[1] IN ('montages', 'sons'));

COMMIT;
