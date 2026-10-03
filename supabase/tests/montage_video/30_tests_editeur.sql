-- Éditeur de montage (phase 3a) : ce que l'écran lit et écrit.
-- Joué après 20_tests_templates_depart.sql.
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 10. Éditeur : nouveau tour sur un montage existant ==='
SELECT set_config('t.qui','base',false) \g /dev/null
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante) VALUES
 ('22222222-0000-0000-0000-000000000005','Éditeur','Monte-la','apercu_pret',2);
INSERT INTO video_versions (job_id, numero, chemin_apercu, prompt, reponse_agent, auteur) VALUES
 ('22222222-0000-0000-0000-000000000005',1,'apercus/22222222-0000-0000-0000-000000000005/v1.mp4','Monte-la','v1 prête','info@neoperformance.ca'),
 ('22222222-0000-0000-0000-000000000005',2,'apercus/22222222-0000-0000-0000-000000000005/v2.mp4','Plus court','v2 prête','info@neoperformance.ca');
INSERT INTO storage.objects (bucket_id, name) VALUES
 ('video-apercus','apercus/22222222-0000-0000-0000-000000000005/v2.mp4');

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.lit('lit le montage', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000005'$q$, 1);
SELECT t.lit('lit ses versions (fil et bande)', $q$select numero, prompt, reponse_agent, auteur from video_versions where job_id='22222222-0000-0000-0000-000000000005' order by numero$q$, 2);
SELECT t.lit('voit l''aperçu de v2 (URL signée)', $q$select 1 from storage.objects where bucket_id='video-apercus' and name='apercus/22222222-0000-0000-0000-000000000005/v2.mp4'$q$, 1);
SELECT t.ecrit('envoie « Qu''est-ce que tu veux changer ? », en trichant sur statut/auteur/erreur',
  $q$insert into video_taches (id, job_id, type, payload, statut, cree_par, erreur) values ('33333333-0000-0000-0000-000000000005','22222222-0000-0000-0000-000000000005','montage','{"prompt":"Musique plus forte"}','en_cours','hugues@neoperformance.ca','x')$q$, '1');
SELECT t.lit('  → en_attente, au nom de info@, sans erreur, prompt gardé', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000005' and statut='en_attente' and cree_par='info@neoperformance.ca' and erreur is null and payload->>'prompt'='Musique plus forte'$q$, 1);
SELECT t.lit('lit les tâches du montage', $q$select 1 from video_taches where job_id='22222222-0000-0000-0000-000000000005'$q$, 1);
SELECT t.ecrit('change la version courante depuis le hub', $q$update video_jobs set version_courante=1 where id='22222222-0000-0000-0000-000000000005'$q$, 'refusé');
SELECT t.ecrit('annule sa tâche en attente', $q$delete from video_taches where id='33333333-0000-0000-0000-000000000005'$q$, '0');

SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.ecrit('hors liste : envoie une demande sur ce montage', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000005','montage','{"prompt":"x"}')$q$, 'refusé');
SELECT t.lit('hors liste : versions du montage', $q$select 1 from video_versions where job_id='22222222-0000-0000-0000-000000000005'$q$, 0);
SELECT t.lit('hors liste : aperçu de v2', $q$select 1 from storage.objects where name='apercus/22222222-0000-0000-0000-000000000005/v2.mp4'$q$, 0);
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.ecrit('non connecté : envoie une demande', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000005','montage','{"prompt":"x"}')$q$, 'refusé');
RESET ROLE;
