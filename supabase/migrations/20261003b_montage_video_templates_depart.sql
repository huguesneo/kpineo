-- =============================================================================
-- Module Montage vidéo : templates de départ (styles déjà validés par Hugues)
-- =============================================================================
-- Données seulement, se rejoue sans erreur (ON CONFLICT DO NOTHING).
--
-- Les deux styles existent déjà dans video-neo : branches style/pub-0929 et
-- style/entrevue-mythe-0924, chacune avec son skill (.claude/skills/<nom>/) qui
-- déclare sa composition de départ (src/pubs/Pub0929.tsx, src/pubs/Pub0924.tsx).
--
-- Insérés directement en « approuve » : le trigger video_templates_approuve ne
-- se déclenche que sur un UPDATE du statut, donc AUCUNE tâche enregistrer_style
-- n'est créée (le style n'est pas à enregistrer). Les triggers des utilisateurs
-- du hub ne s'appliquent pas à une migration (rôle postgres).
--
-- Aperçus : déposés à part dans le bucket video-apercus, sous
-- templates/<id>/apercu.mp4 (extraits de out/pub-0929-neo-pub.mp4 et
-- out/pub-0924-hd.mp4, 10 s, 540 x 960).
-- =============================================================================

INSERT INTO public.video_templates
  (id, nom, type_video, reference_video_neo, chemin_apercu, statut,
   propose_par, approuve_par, approuve_le, style_enregistre)
VALUES
  ('4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f', 'Pub 0929', 'neo-video-montage',
   'style/pub-0929', 'templates/4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f/apercu.mp4', 'approuve',
   'hugues@neoperformance.ca', 'hugues@neoperformance.ca', now(), true),
  ('678ddebc-013f-45ed-b164-cbeaf886c833', 'Entrevue mythe 0924', 'neo-video-montage',
   'style/entrevue-mythe-0924', 'templates/678ddebc-013f-45ed-b164-cbeaf886c833/apercu.mp4', 'approuve',
   'hugues@neoperformance.ca', 'hugues@neoperformance.ca', now(), true)
ON CONFLICT (id) DO NOTHING;
