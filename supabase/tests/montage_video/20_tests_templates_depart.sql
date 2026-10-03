-- Templates de départ (20261003b) et colonne style_enregistre (20261003a).
-- Joué après 10_tests_rls.sql et l'insertion des templates de départ.
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 9. Templates de départ (20261003a, 20261003b) ==='
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.lit('deux templates de départ approuvés, style enregistré, par Hugues', $q$select 1 from video_templates where id in ('4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f','678ddebc-013f-45ed-b164-cbeaf886c833') and statut='approuve' and style_enregistre and approuve_par='hugues@neoperformance.ca' and approuve_le is not null and chemin_apercu = 'templates/' || id || '/apercu.mp4'$q$, 2);
SELECT t.lit('  → références video-neo', $q$select 1 from video_templates where (nom, reference_video_neo) in (('Pub 0929','style/pub-0929'),('Entrevue mythe 0924','style/entrevue-mythe-0924'))$q$, 2);
SELECT t.lit('  → aucune tâche enregistrer_style pour eux', $q$select 1 from video_taches where type='enregistrer_style' and payload->>'template_id' in ('4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f','678ddebc-013f-45ed-b164-cbeaf886c833')$q$, 0);

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.lit('la galerie (approuvés) montre les templates de départ', $q$select 1 from video_templates where statut='approuve' and id in ('4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f','678ddebc-013f-45ed-b164-cbeaf886c833')$q$, 2);
SELECT t.ecrit('crée un montage avec un template de départ', $q$insert into video_jobs (titre, template_id) values ('Pub octobre','4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f')$q$, '1');
SELECT t.ecrit('propose un template en trichant sur style_enregistre', $q$insert into video_templates (id, nom, type_video, style_enregistre) values ('11111111-0000-0000-0000-000000000011','Triche','neo-video-montage',true)$q$, '1');
SELECT t.lit('  → style_enregistre forcé à false', $q$select 1 from video_templates where id='11111111-0000-0000-0000-000000000011' and not style_enregistre$q$, 1);
SELECT t.ecrit('passe style_enregistre à true', $q$update video_templates set style_enregistre=true where id='11111111-0000-0000-0000-000000000011'$q$, 'refusé');
SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('Hugues remet style_enregistre à false', $q$update video_templates set style_enregistre=false where id='4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f'$q$, 'refusé');
RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('agent : style_enregistre à true', $q$update video_templates set style_enregistre=true where id='11111111-0000-0000-0000-000000000011'$q$, '1');
RESET ROLE;
SELECT t.lit('toujours aucune tâche enregistrer_style pour les templates de départ', $q$select 1 from video_taches where type='enregistrer_style' and payload->>'template_id' in ('4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f','678ddebc-013f-45ed-b164-cbeaf886c833')$q$, 0);
