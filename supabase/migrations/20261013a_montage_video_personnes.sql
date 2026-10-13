-- =============================================================================
-- Module Montage vidéo : « Qui est dans la vidéo ? » (moteur recette)
-- =============================================================================
-- Additive, se rejoue sans erreur. Aucune fonction ni aucun trigger réécrit.
--
--   video_jobs.personnes : réponse obligatoire au dépôt dans le hub.
--     moi_equipe : Hugues ou l'équipe → transcription Scribe (ElevenLabs).
--     cliente    : une cliente apparaît → Whisper seulement, sur le Mac ;
--                  rien ne part chez ElevenLabs.
--     NULL       : montage d'avant le moteur recette (l'agent garde l'ancien moteur).
--
-- Le hub la remplit à l'insertion (video_jobs_avant_insert ne la touche pas) ;
-- video_jobs_avant_update l'empêche ensuite de changer depuis le hub.

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS personnes text
  CHECK (personnes IN ('moi_equipe', 'cliente'));

COMMENT ON COLUMN public.video_jobs.personnes IS
  'Qui est dans la vidéo : moi_equipe (Scribe) ou cliente (Whisper seulement). NULL : montage d''avant le moteur recette.';
