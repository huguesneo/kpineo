-- Clips d'un montage (principal et b-roll) : migrations 20261003c et 20261003f
-- (ajout et remplacement après la v1, section 13b).
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

\echo
\echo '=== 13b. Clips : ajout et remplacement après la v1 (20261003f) ==='
SELECT set_config('t.qui','base',false) \g /dev/null
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante) VALUES
 ('22222222-0000-0000-0000-000000000007','Après v1','Monte','apercu_pret',2),
 ('22222222-0000-0000-0000-000000000008','Lancement','Monte','en_file',0);
INSERT INTO video_clips (job_id, ordre, role, nom, nom_source) VALUES
 ('22222222-0000-0000-0000-000000000007',1,'principal','Entrevue','A.mov'),
 ('22222222-0000-0000-0000-000000000007',2,'broll','Cuisine','B.mov');

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('ajoute un B-roll (ordre 1 envoyé, durée et version trichées)',
  $q$insert into video_clips (job_id, ordre, role, nom, nom_source, duree_s, ajoute_en_version) values ('22222222-0000-0000-0000-000000000007',1,'broll','Marché','C.mov',99,99)$q$, '1');
SELECT t.lit('  → ordre 3 donné par la base, ajouté en v2, durée vide, ne remplace rien', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000007' and nom='Marché' and ordre=3 and ajoute_en_version=2 and duree_s is null and remplace_ordre is null$q$, 1);
SELECT t.ecrit('remplace le clip 2 (B-roll)',
  $q$insert into video_clips (job_id, role, nom, nom_source, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','broll','Cuisine 2','D.mov',2)$q$, '1');
SELECT t.lit('  → clip 4, remplace le clip 2', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000007' and ordre=4 and remplace_ordre=2$q$, 1);
SELECT t.lit('  → l''ancien clip 2 est toujours là, inchangé', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000007' and ordre=2 and nom='Cuisine' and nom_source='B.mov' and remplace_ordre is null$q$, 1);
SELECT t.ecrit('remplace encore le clip 2', $q$insert into video_clips (job_id, role, nom, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','broll','x',2)$q$, 'refusé');
SELECT t.ecrit('remplace un clip qui n''existe pas (9)', $q$insert into video_clips (job_id, role, nom, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','broll','x',9)$q$, 'refusé');
SELECT t.ecrit('remplace le seul Principal par un B-roll', $q$insert into video_clips (job_id, role, nom, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','broll','x',1)$q$, 'refusé');
SELECT t.ecrit('remplace le Principal 1 par un Principal',
  $q$insert into video_clips (job_id, role, nom, nom_source, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','principal','Entrevue 2','E.mov',1)$q$, '1');
SELECT t.ecrit('remplace ce nouveau Principal (5) par un B-roll', $q$insert into video_clips (job_id, role, nom, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','broll','x',5)$q$, 'refusé');
SELECT t.ecrit('ajoute un Principal manquant (à la fin)',
  $q$insert into video_clips (job_id, role, nom, nom_source) values ('22222222-0000-0000-0000-000000000007','principal','Conclusion','F.mov')$q$, '1');
SELECT t.lit('  → clip 6, Principal', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000007' and ordre=6 and role='principal'$q$, 1);
SELECT t.ecrit('remplace alors le Principal 5 par un B-roll (le 6 reste)',
  $q$insert into video_clips (job_id, role, nom, nom_source, remplace_ordre) values ('22222222-0000-0000-0000-000000000007','broll','Plan large','G.mov',5)$q$, '1');
SELECT t.ecrit('renomme un clip', $q$update video_clips set nom='x' where job_id='22222222-0000-0000-0000-000000000007'$q$, '0');
SELECT t.ecrit('supprime un clip remplacé', $q$delete from video_clips where job_id='22222222-0000-0000-0000-000000000007' and ordre=2$q$, '0');
SELECT t.ecrit('au lancement, en trichant sur remplace_ordre et ajoute_en_version',
  $q$insert into video_clips (job_id, ordre, role, nom, remplace_ordre, ajoute_en_version) values ('22222222-0000-0000-0000-000000000008',1,'principal','Source',1,3)$q$, '1');
SELECT t.lit('  → les deux colonnes restent vides', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000008' and remplace_ordre is null and ajoute_en_version is null$q$, 1);

SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.ecrit('hors liste : ajoute un clip après la v1', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','x')$q$, 'refusé');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.ecrit('non connecté : ajoute un clip après la v1', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','x')$q$, 'refusé');
RESET ROLE;

-- Rendu final et montage terminé
SELECT set_config('t.qui','base',false) \g /dev/null
UPDATE video_jobs SET statut='rendu' WHERE id='22222222-0000-0000-0000-000000000007';
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('ajoute un clip pendant le rendu final', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','x')$q$, 'refusé');
RESET ROLE;
UPDATE video_jobs SET statut='apercu_pret' WHERE id='22222222-0000-0000-0000-000000000007';
INSERT INTO video_taches (id, job_id, type, payload, statut) VALUES
 ('33333333-0000-0000-0000-000000000007','22222222-0000-0000-0000-000000000007','terminer','{}','en_attente');
SET ROLE authenticated;
SELECT t.ecrit('ajoute un clip pendant que Terminer attend', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','x')$q$, 'refusé');
RESET ROLE;
UPDATE video_taches SET statut='fait' WHERE id='33333333-0000-0000-0000-000000000007';
UPDATE video_jobs SET statut='termine' WHERE id='22222222-0000-0000-0000-000000000007';
SET ROLE authenticated;
SELECT t.ecrit('ajoute un clip à un montage terminé', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','Fin')$q$, '1');
SELECT t.ecrit('ajoute le 9e clip', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','Neuf')$q$, '1');
SELECT t.ecrit('ajoute le 10e clip', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','Dix')$q$, '1');
SELECT t.ecrit('un 11e clip (remplacés compris)', $q$insert into video_clips (job_id, role, nom) values ('22222222-0000-0000-0000-000000000007','broll','Onze')$q$, 'refusé');
SELECT t.lit('  → 10 clips, ordres 1 à 10', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000007' and ordre between 1 and 10$q$, 10);
RESET ROLE;

SET ROLE service_role; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('recopie un clip remplaçant dans une variante (colonnes gardées)',
  $q$insert into video_clips (job_id, ordre, role, nom, remplace_ordre, ajoute_en_version) values ('22222222-0000-0000-0000-000000000008',2,'broll','Copie',1,2)$q$, '1');
SELECT t.lit('  → remplace_ordre et ajoute_en_version gardés', $q$select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000008' and ordre=2 and remplace_ordre=1 and ajoute_en_version=2$q$, 1);
RESET ROLE;
SELECT set_config('t.qui','base',false) \g /dev/null
DELETE FROM video_jobs WHERE id IN ('22222222-0000-0000-0000-000000000007','22222222-0000-0000-0000-000000000008');
