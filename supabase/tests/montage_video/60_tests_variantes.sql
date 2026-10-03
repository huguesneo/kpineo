-- Variantes (étape 10b) : la tâche posée par le hub, le lien variante_de écrit
-- par l'agent seulement. Joué après 20261003e_montage_video_variantes.sql.
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 17. Variantes : demande depuis l''éditeur ==='
SELECT set_config('t.qui','base',false) \g /dev/null
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante, format) VALUES
 ('22222222-0000-0000-0000-000000000030','Origine','Monte-la','apercu_pret',2,'9:16');

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('demande une variante « autre hook »',
  $q$insert into video_taches (id, job_id, type, payload) values ('33333333-0000-0000-0000-000000000030','22222222-0000-0000-0000-000000000030','variante','{"hook":"Ton cortisol te ment"}')$q$, '1');
SELECT t.lit('  → en_attente, au nom de info@, hook gardé', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000030' and statut='en_attente' and cree_par='info@neoperformance.ca' and payload->>'hook'='Ton cortisol te ment'$q$, 1);
SELECT t.ecrit('demande une variante 4:5 avec consigne',
  $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000030','variante','{"format":"4:5","prompt":"Sous-titres plus hauts"}')$q$, '1');
SELECT t.ecrit('crée un montage en se disant variante (forcé à vide)',
  $q$insert into video_jobs (id, titre, prompt, variante_de) values ('22222222-0000-0000-0000-000000000031','Fausse variante','x','22222222-0000-0000-0000-000000000030')$q$, '1');
SELECT t.lit('  → variante_de vide', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000031' and variante_de is null$q$, 1);
SELECT t.ecrit('relie un montage à une origine après coup', $q$update video_jobs set variante_de='22222222-0000-0000-0000-000000000030' where id='22222222-0000-0000-0000-000000000031'$q$, 'refusé');

\echo
\echo '=== 18. Variantes : création par l''agent ==='
RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('crée la variante reliée à son origine',
  $q$insert into video_jobs (id, titre, cree_par, prompt, format, statut, variante_de) values ('22222222-0000-0000-0000-000000000032','Origine (variante 4:5)','info@neoperformance.ca','Format 4:5','4:5','montage','22222222-0000-0000-0000-000000000030')$q$, '1');
SELECT t.lit('  → variante_de gardé, format 4:5', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000032' and variante_de='22222222-0000-0000-0000-000000000030' and format='4:5'$q$, 1);

RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.lit('lit les variantes de l''origine', $q$select 1 from video_jobs where variante_de='22222222-0000-0000-0000-000000000030'$q$, 1);
SELECT t.ecrit('renomme la variante (titre seul)', $q$update video_jobs set titre='Origine : 4:5' where id='22222222-0000-0000-0000-000000000032'$q$, '1');
SELECT t.ecrit('détache la variante de son origine', $q$update video_jobs set variante_de=null where id='22222222-0000-0000-0000-000000000032'$q$, 'refusé');

SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.ecrit('hors liste : demande une variante', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000030','variante','{"hook":"x"}')$q$, 'refusé');
SELECT t.lit('hors liste : variantes', $q$select 1 from video_jobs where variante_de is not null$q$, 0);
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.ecrit('non connecté : demande une variante', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000030','variante','{"format":"1:1"}')$q$, 'refusé');
RESET ROLE;

SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.ecrit('supprimer l''origine garde la variante', $q$delete from video_jobs where id='22222222-0000-0000-0000-000000000030'$q$, '1');
SELECT t.lit('  → variante toujours là, variante_de vide', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000032' and variante_de is null$q$, 1);
