-- Templates proposés depuis l'éditeur, approbation par Hugues, refus motivé,
-- archivage (étape 10a, migration 20261003d).
-- Joué après 40_tests_clips.sql et la migration 20261003d (deux fois).
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 14. Templates proposés : proposition depuis l''éditeur ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('propose la v2 d''un montage (nom, description), en trichant sur statut et motif',
  $q$insert into video_templates (id, nom, description, type_video, job_id, numero_version, statut, motif_refus) values ('11111111-0000-0000-0000-000000000020','Style Éditeur','Coupes rapides, sous-titres jaunes','neo-video-montage','22222222-0000-0000-0000-000000000005',2,'approuve','x')$q$, '1');
SELECT t.lit('  → propose, au nom de info@, sans motif, style non enregistré, lié à la v2',
  $q$select 1 from video_templates where id='11111111-0000-0000-0000-000000000020' and statut='propose' and propose_par='info@neoperformance.ca' and motif_refus is null and not style_enregistre and job_id='22222222-0000-0000-0000-000000000005' and numero_version=2 and description='Coupes rapides, sous-titres jaunes'$q$, 1);
SELECT t.lit('  → aucune tâche enregistrer_style à la proposition', $q$select 1 from video_taches where payload->>'template_id'='11111111-0000-0000-0000-000000000020'$q$, 0);
SELECT t.lit('  → absent de la galerie (approuvés, style enregistré)', $q$select 1 from video_templates where statut='approuve' and style_enregistre and id='11111111-0000-0000-0000-000000000020'$q$, 0);
SELECT t.ecrit('crée un montage avec ce template proposé', $q$insert into video_jobs (titre, template_id) values ('x','11111111-0000-0000-0000-000000000020')$q$, 'refusé');
SELECT t.ecrit('approuve sa proposition', $q$update video_templates set statut='approuve' where id='11111111-0000-0000-0000-000000000020'$q$, 'refusé');
SELECT t.ecrit('refuse sa proposition', $q$update video_templates set statut='refuse' where id='11111111-0000-0000-0000-000000000020'$q$, 'refusé');
SELECT t.ecrit('écrit un motif de refus', $q$update video_templates set motif_refus='x' where id='11111111-0000-0000-0000-000000000020'$q$, 'refusé');
SELECT t.ecrit('crée la tâche enregistrer_style elle-même', $q$insert into video_taches (type, payload) values ('enregistrer_style','{"template_id":"11111111-0000-0000-0000-000000000020"}')$q$, 'refusé');
SELECT t.ecrit('corrige la description de sa proposition ouverte', $q$update video_templates set description='Coupes rapides' where id='11111111-0000-0000-0000-000000000020'$q$, '1');
SELECT t.ecrit('propose une 2e version (pour le refus)',
  $q$insert into video_templates (id, nom, type_video, job_id, numero_version) values ('11111111-0000-0000-0000-000000000021','Style v1','neo-video-montage','22222222-0000-0000-0000-000000000005',1)$q$, '1');
SELECT t.lit('voit toutes les propositions (écran Templates)', $q$select 1 from video_templates where id in ('11111111-0000-0000-0000-000000000020','11111111-0000-0000-0000-000000000021')$q$, 2);

\echo
\echo '=== 15. Templates proposés : décision de Hugues ==='
SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('refuse la v1 avec un motif', $q$update video_templates set statut='refuse', motif_refus='Trop proche de Pub 0929' where id='11111111-0000-0000-0000-000000000021'$q$, '1');
SELECT t.lit('  → refuse, motif gardé, approuve_par hugues@', $q$select 1 from video_templates where id='11111111-0000-0000-0000-000000000021' and statut='refuse' and motif_refus='Trop proche de Pub 0929' and approuve_par='hugues@neoperformance.ca' and approuve_le is not null$q$, 1);
SELECT t.lit('  → aucune tâche pour le refusé', $q$select 1 from video_taches where payload->>'template_id'='11111111-0000-0000-0000-000000000021'$q$, 0);
SELECT t.ecrit('approuve un template refusé', $q$update video_templates set statut='approuve' where id='11111111-0000-0000-0000-000000000021'$q$, 'refusé');
SELECT t.ecrit('archive une proposition (pas encore approuvée)', $q$update video_templates set statut='archive' where id='11111111-0000-0000-0000-000000000020'$q$, 'refusé');
SELECT t.ecrit('approuve la v2', $q$update video_templates set statut='approuve' where id='11111111-0000-0000-0000-000000000020'$q$, '1');
SELECT t.lit('  → tâche enregistrer_style { template_id } créée par la base, au nom de Hugues',
  $q$select 1 from video_taches where type='enregistrer_style' and statut='en_attente' and job_id is null and payload = jsonb_build_object('template_id','11111111-0000-0000-0000-000000000020') and cree_par='hugues@neoperformance.ca'$q$, 1);
SELECT t.lit('  → pas encore dans la galerie (style non enregistré)', $q$select 1 from video_templates where statut='approuve' and style_enregistre and id='11111111-0000-0000-0000-000000000020'$q$, 0);
RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('agent : style enregistré (branche, aperçu)', $q$update video_templates set reference_video_neo='style/style-editeur', chemin_apercu='templates/11111111-0000-0000-0000-000000000020/apercu.mp4', style_enregistre=true where id='11111111-0000-0000-0000-000000000020'$q$, '1');
RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.lit('  → dans la galerie de info@', $q$select 1 from video_templates where statut='approuve' and style_enregistre and id='11111111-0000-0000-0000-000000000020'$q$, 1);
SELECT t.ecrit('monte avec ce template', $q$insert into video_jobs (id, titre, template_id) values ('22222222-0000-0000-0000-000000000020','Avec style','11111111-0000-0000-0000-000000000020')$q$, '1');
SELECT t.ecrit('archive le template approuvé', $q$update video_templates set statut='archive' where id='11111111-0000-0000-0000-000000000020'$q$, '0');
SELECT t.ecrit('modifie le template approuvé (description)', $q$update video_templates set description='Piraté' where id='11111111-0000-0000-0000-000000000020'$q$, '0');

\echo
\echo '=== 16. Templates : archivage par Hugues ==='
SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('archive le template approuvé', $q$update video_templates set statut='archive' where id='11111111-0000-0000-0000-000000000020'$q$, '1');
SELECT t.lit('  → sorti de la galerie', $q$select 1 from video_templates where statut='approuve' and id='11111111-0000-0000-0000-000000000020'$q$, 0);
SELECT t.lit('  → le montage qui l''a utilisé est intact', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000020' and template_id='11111111-0000-0000-0000-000000000020'$q$, 1);
SELECT t.lit('  → style toujours enregistré (branche gardée)', $q$select 1 from video_templates where id='11111111-0000-0000-0000-000000000020' and style_enregistre and reference_video_neo='style/style-editeur'$q$, 1);
SELECT t.ecrit('nouveau montage avec le template archivé', $q$insert into video_jobs (titre, template_id) values ('x','11111111-0000-0000-0000-000000000020')$q$, 'refusé');
SELECT t.ecrit('repasse un archivé en proposé', $q$update video_templates set statut='propose' where id='11111111-0000-0000-0000-000000000020'$q$, 'refusé');
SELECT t.ecrit('statut inconnu', $q$update video_templates set statut='supprime' where id='11111111-0000-0000-0000-000000000020'$q$, 'refusé');
SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('remet en galerie le template archivé', $q$update video_templates set statut='approuve' where id='11111111-0000-0000-0000-000000000020'$q$, '0');
SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.lit('hors liste : templates', $q$select 1 from video_templates$q$, 0);
SELECT t.ecrit('hors liste : archive un template', $q$update video_templates set statut='archive' where id='4aa4bc15-1d52-4c4f-a65a-8a3c2e22ad3f'$q$, '0');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.ecrit('non connecté : propose un template', $q$insert into video_templates (nom, type_video) values ('x','neo-video-montage')$q$, 'refusé');
RESET ROLE;
