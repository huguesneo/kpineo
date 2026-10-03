-- Clips d'un montage (principal et b-roll) : migration 20261003c.
-- Joué après 30_tests_editeur.sql : la migration des clips est appliquée
-- (deux fois) sur une base qui a déjà des montages, pour tester le backfill.
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 11. Clips : backfill des montages existants ==='
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.lit('chaque montage existant a exactement un clip', $q$select 1 from video_jobs j where (select count(*) from video_clips c where c.job_id=j.id) <> 1$q$, 0);
SELECT t.lit('  → clip 1, principal, même source que le montage', $q$select 1 from video_jobs j join video_clips c on c.job_id=j.id where not (c.ordre=1 and c.role='principal' and c.fichier_drive_id is not distinct from j.fichier_drive_id and c.nom_source is not distinct from j.nom_source)$q$, 0);
SELECT t.lit('  → la source de video_jobs est intacte', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000005' and titre='Éditeur'$q$, 1);
SELECT t.lit('  → nom = nom_source, sinon le titre', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000005' and nom='Éditeur'$q$, 1);

\echo
\echo '=== 12. Clips : lancement depuis le hub ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('crée un montage (source = clip principal)',
  $q$insert into video_jobs (id, titre, prompt, fichier_drive_id, nom_source) values ('22222222-0000-0000-0000-000000000006','Multi','Monte','d-a','A_2026-10-03_1000.mov')$q$, '1');
SELECT t.ecrit('écrit 3 clips ordonnés, en trichant sur duree_s',
  $q$insert into video_clips (job_id, ordre, role, nom, fichier_drive_id, nom_source, duree_s) values
     ('22222222-0000-0000-0000-000000000006',1,'principal','Entrevue','d-a','A_2026-10-03_1000.mov',99),
     ('22222222-0000-0000-0000-000000000006',2,'broll','Cuisine','d-b','B_2026-10-03_1001.mov',null),
     ('22222222-0000-0000-0000-000000000006',3,'broll','Marche','d-c','C_2026-10-03_1002.mov',null)$q$, '3');
SELECT t.lit('  → lit les clips dans l''ordre, duree_s forcée à vide', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000006' and duree_s is null$q$, 3);
SELECT t.ecrit('deux clips au même ordre', $q$insert into video_clips (job_id, ordre, nom) values ('22222222-0000-0000-0000-000000000006',2,'Doublon')$q$, 'refusé');
SELECT t.ecrit('un 11e clip (ordre 11)', $q$insert into video_clips (job_id, ordre, nom) values ('22222222-0000-0000-0000-000000000006',11,'Trop')$q$, 'refusé');
SELECT t.ecrit('rôle inconnu', $q$insert into video_clips (job_id, ordre, role, nom) values ('22222222-0000-0000-0000-000000000006',4,'musique','x')$q$, 'refusé');
SELECT t.ecrit('nom vide', $q$insert into video_clips (job_id, ordre, nom) values ('22222222-0000-0000-0000-000000000006',4,'  ')$q$, 'refusé');
SELECT t.ecrit('renomme un clip après le lancement', $q$update video_clips set nom='x' where job_id='22222222-0000-0000-0000-000000000006'$q$, '0');
SELECT t.ecrit('supprime un clip', $q$delete from video_clips where job_id='22222222-0000-0000-0000-000000000006'$q$, '0');
SELECT t.ecrit('ajoute un clip à un montage qui a déjà une version', $q$insert into video_clips (job_id, ordre, nom) values ('22222222-0000-0000-0000-000000000005',2,'Tard')$q$, 'refusé');

SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.lit('lit les clips', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000006'$q$, 3);

SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.lit('hors liste : clips', 'select * from video_clips', 0);
SELECT t.ecrit('hors liste : ajoute un clip', $q$insert into video_clips (job_id, ordre, nom) values ('22222222-0000-0000-0000-000000000006',4,'x')$q$, 'refusé');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.lit('non connecté : clips', 'select * from video_clips', 0);
SELECT t.ecrit('non connecté : ajoute un clip', $q$insert into video_clips (job_id, ordre, nom) values ('22222222-0000-0000-0000-000000000006',4,'x')$q$, 'refusé');
RESET ROLE;

\echo
\echo '=== 13. Clips : agent (service_role) ==='
SET ROLE service_role; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('écrit la durée d''un clip', $q$update video_clips set duree_s=12.5 where job_id='22222222-0000-0000-0000-000000000006' and ordre=2$q$, '1');
RESET ROLE;
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.ecrit('supprimer le montage supprime ses clips', $q$delete from video_jobs where id='22222222-0000-0000-0000-000000000006'$q$, '1');
SELECT t.lit('  → plus aucun clip pour ce montage', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000006'$q$, 0);
