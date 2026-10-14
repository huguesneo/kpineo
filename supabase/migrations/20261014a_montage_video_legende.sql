-- =============================================================================
-- Module Montage vidéo : légende Facebook / Instagram écrite au Terminer
-- =============================================================================
-- Additive, se rejoue sans erreur. Aucune fonction ni aucun trigger réécrit.
--
--   video_jobs.legende : légende commune FB/IG écrite par l'agent (skill
--     legende-social-media) au Terminer, aussi en .txt à côté de l'export dans
--     Drive. Jamais publiée. NULL : pas de légende (montage d'avant, ou échec de
--     la génération : le montage se termine quand même).
--
-- Écrite seulement par l'agent (service_role) : video_jobs_avant_update refuse
-- déjà toute modification depuis le hub, sauf le titre.

ALTER TABLE public.video_jobs
  ADD COLUMN IF NOT EXISTS legende text;

COMMENT ON COLUMN public.video_jobs.legende IS
  'Légende FB/IG écrite par l''agent au Terminer (skill legende-social-media). Jamais publiée. NULL : aucune.';
