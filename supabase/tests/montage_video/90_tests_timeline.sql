-- Timeline du hub : types de tâche, video_timeline, video_timeline_requetes, bucket video-timeline.
-- Joué après 20261013a (personnes) et 20261015a_montage_video_timeline.sql.
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 28. Timeline : tâches ==='
SELECT set_config('t.qui','base',false) \g /dev/null
UPDATE video_taches SET statut = 'fait' WHERE statut IN ('en_attente','en_cours');
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante, personnes) VALUES
 ('22222222-0000-0000-0000-000000000070','Équipe','x','apercu_pret',1,'moi_equipe'),
 ('22222222-0000-0000-0000-000000000071','Cliente','x','apercu_pret',1,'cliente');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('demande timeline_preparer', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000070','timeline_preparer')$q$, '1');
SELECT t.ecrit('demande timeline_appliquer', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000070','timeline_appliquer')$q$, '1');
SELECT t.ecrit('timeline_preparer pour une cliente (fermée)', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000071','timeline_preparer')$q$, 'refusé');
SELECT t.ecrit('montage pour une cliente (montage IA : permis)', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000071','montage','{"prompt":"x"}')$q$, '1');
SELECT t.ecrit('type inconnu', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000070','timeline_autre')$q$, 'refusé');
SELECT t.lit('  → tâches nées en_attente au nom de info@', $q$select 1 from video_taches where job_id='22222222-0000-0000-0000-000000000070' and statut='en_attente' and cree_par='info@neoperformance.ca'$q$, 2);
RESET ROLE;

\echo
\echo '=== 29. Timeline : recette et brouillon ==='
SELECT set_config('t.qui','agent',false) \g /dev/null
INSERT INTO video_timeline (job_id, numero_version, recette, ressources) VALUES
 ('22222222-0000-0000-0000-000000000070', 1, '{"version":1}', '{"proxy":"montages/70/proxy-a.mp4"}');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.lit('lit la timeline', $q$select 1 from video_timeline where job_id='22222222-0000-0000-0000-000000000070'$q$, 1);
SELECT t.ecrit('écrit le brouillon', $q$update video_timeline set brouillon='{"version":1,"cartes":[]}', brouillon_par='quelqu''un' where job_id='22222222-0000-0000-0000-000000000070'$q$, '1');
SELECT t.lit('  → brouillon_par et brouillon_le remplis par la base', $q$select 1 from video_timeline where brouillon_par='hugues@neoperformance.ca' and brouillon_le is not null$q$, 1);
SELECT t.ecrit('change la recette (agent seulement)', $q$update video_timeline set recette='{}' where job_id='22222222-0000-0000-0000-000000000070'$q$, 'refusé');
SELECT t.ecrit('change les ressources (agent seulement)', $q$update video_timeline set ressources='{}' where job_id='22222222-0000-0000-0000-000000000070'$q$, 'refusé');
SELECT t.ecrit('brouillon de plus de 1 Mo', $q$update video_timeline set brouillon=jsonb_build_object('x', repeat('a', 1100000)) where job_id='22222222-0000-0000-0000-000000000070'$q$, 'refusé');
SELECT t.ecrit('crée une timeline (agent seulement)', $q$insert into video_timeline (job_id) values ('22222222-0000-0000-0000-000000000071')$q$, 'refusé');
SELECT t.ecrit('supprime une timeline', $q$delete from video_timeline where job_id='22222222-0000-0000-0000-000000000070'$q$, '0');
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"autre@neoperformance.ca"}',false), set_config('t.qui','autre',false) \g /dev/null
SELECT t.lit('autre compte : ne voit rien', $q$select 1 from video_timeline$q$, 0);
SELECT t.ecrit('autre compte : écrit le brouillon', $q$update video_timeline set brouillon='{}'$q$, '0');
RESET ROLE;

\echo
\echo '=== 30. Timeline : vérifications courtes ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('demande une vérification', $q$insert into video_timeline_requetes (job_id, type, recette, statut, reponse) values ('22222222-0000-0000-0000-000000000070','verifier','{"version":1}','fait','{"faux":true}')$q$, '1');
SELECT t.lit('  → née en_attente, sans réponse, au nom de info@', $q$select 1 from video_timeline_requetes where statut='en_attente' and reponse is null and cree_par='info@neoperformance.ca'$q$, 1);
SELECT t.ecrit('vérification pour une cliente (fermée)', $q$insert into video_timeline_requetes (job_id, type, recette) values ('22222222-0000-0000-0000-000000000071','verifier','{}')$q$, 'refusé');
SELECT t.ecrit('type inconnu', $q$insert into video_timeline_requetes (job_id, type, recette) values ('22222222-0000-0000-0000-000000000070','rendre','{}')$q$, 'refusé');
SELECT t.ecrit('écrit la réponse (agent seulement)', $q$update video_timeline_requetes set reponse='{}', statut='fait'$q$, '0');
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"autre@neoperformance.ca"}',false), set_config('t.qui','autre',false) \g /dev/null
SELECT t.ecrit('autre compte : demande une vérification', $q$insert into video_timeline_requetes (job_id, type, recette) values ('22222222-0000-0000-0000-000000000070','verifier','{}')$q$, 'refusé');
SELECT t.lit('autre compte : ne voit rien', $q$select 1 from video_timeline_requetes$q$, 0);
RESET ROLE;

\echo
\echo '=== 31. Bucket video-timeline ==='
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.lit('bucket privé', $q$select 1 from storage.buckets where id='video-timeline' and public = false$q$, 1);
INSERT INTO storage.objects (bucket_id, name) VALUES
 ('video-timeline','montages/22222222-0000-0000-0000-000000000070/proxy-a.mp4'),
 ('video-timeline','sons/texte/pop_01.MP3'),
 ('video-timeline','ailleurs/x.mp4');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.lit('lit montages/ et sons/', $q$select 1 from storage.objects where bucket_id='video-timeline'$q$, 2);
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"autre@neoperformance.ca"}',false), set_config('t.qui','autre',false) \g /dev/null
SELECT t.lit('autre compte : ne lit rien', $q$select 1 from storage.objects where bucket_id='video-timeline'$q$, 0);
RESET ROLE;
SET ROLE anon; SELECT set_config('request.jwt.claims','{}',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.lit('anonyme : ne lit rien', $q$select 1 from storage.objects where bucket_id='video-timeline'$q$, 0);
RESET ROLE;
