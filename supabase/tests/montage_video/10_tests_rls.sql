-- Tests RLS et triggers du module Montage vidéo.
-- Lancer avec supabase/tests/montage_video/run.sh (base locale jetable).
\set QUIET on
\pset footer off
\pset tuples_only on
-- ---------- Outils de test ----------
CREATE SCHEMA IF NOT EXISTS t;
GRANT USAGE ON SCHEMA t TO anon, authenticated, service_role;
-- Exécute une écriture : renvoie le nombre de lignes touchées ou « refusé »
CREATE OR REPLACE FUNCTION t.ecrit(nom text, req text, attendu text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int; r text;
BEGIN
  BEGIN EXECUTE req; GET DIAGNOSTICS n = ROW_COUNT; r := n::text;
  EXCEPTION WHEN others THEN r := 'refusé (' || SQLERRM || ')'; END;
  RETURN CASE WHEN r = attendu OR (attendu = 'refusé' AND r LIKE 'refusé%') THEN 'PASS ' ELSE 'FAIL ' END
         || rpad(current_setting('t.qui', true), 8) || nom || '  →  ' || r;
END $$;
-- Compte les lignes visibles
CREATE OR REPLACE FUNCTION t.lit(nom text, req text, attendu int) RETURNS text LANGUAGE plpgsql AS $$
DECLARE n int;
BEGIN
  EXECUTE 'SELECT count(*) FROM (' || req || ') x' INTO n;
  RETURN CASE WHEN n = attendu THEN 'PASS ' ELSE 'FAIL ' END
         || rpad(current_setting('t.qui', true), 8) || nom || '  →  ' || n || ' ligne(s)';
END $$;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA t TO anon, authenticated, service_role;

-- ---------- Données de départ (créées comme migration / agent) ----------
INSERT INTO video_templates (id, nom, type_video, statut, propose_par, approuve_par, approuve_le) VALUES
 ('11111111-0000-0000-0000-000000000001','Hook NEO','reel-hook','approuve','hugues@neoperformance.ca','hugues@neoperformance.ca',now()),
 ('11111111-0000-0000-0000-000000000002','Proposition Cloé','reel-temoignage','propose','info@neoperformance.ca',NULL,NULL),
 ('11111111-0000-0000-0000-000000000003','Proposition 2','reel-conseil','propose','info@neoperformance.ca',NULL,NULL);
INSERT INTO video_jobs (id, titre, prompt, statut) VALUES
 ('22222222-0000-0000-0000-000000000001','Cortisol','Monte un reel dynamique','apercu_pret');
INSERT INTO video_versions (job_id, numero, commit_git, chemin_apercu, prompt, reponse_agent, auteur) VALUES
 ('22222222-0000-0000-0000-000000000001',1,'abc123','apercus/22222222-0000-0000-0000-000000000001/v1.mp4','Monte un reel dynamique','v1 prête','info@neoperformance.ca');
INSERT INTO storage.objects (bucket_id, name) VALUES
 ('video-apercus','apercus/22222222-0000-0000-0000-000000000001/v1.mp4'),
 ('video-apercus','templates/11111111-0000-0000-0000-000000000001/apercu.mp4'),
 ('video-apercus','autre/fichier.mp4'),
 ('social-media','post.jpg');

\echo
\echo '=== 1. Lecture : qui voit quoi ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.lit('voit les montages',          'select * from video_jobs', 1);
SELECT t.lit('voit les versions',          'select * from video_versions', 1);
SELECT t.lit('voit les templates',         'select * from video_templates', 3);
SELECT t.lit('voit l''état de l''agent',   'select * from video_agent_status', 1);
SELECT t.lit('voit les aperçus (apercus/ et templates/ seulement)', 'select * from storage.objects', 2);
SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.lit('hors liste : montages',      'select * from video_jobs', 0);
SELECT t.lit('hors liste : versions',      'select * from video_versions', 0);
SELECT t.lit('hors liste : templates',     'select * from video_templates', 0);
SELECT t.lit('hors liste : tâches',        'select * from video_taches', 0);
SELECT t.lit('hors liste : état agent',    'select * from video_agent_status', 0);
SELECT t.lit('hors liste : aperçus',       'select * from storage.objects', 0);
SELECT t.ecrit('hors liste : crée un montage', $q$insert into video_jobs (titre, prompt) values ('x','y')$q$, 'refusé');
SELECT t.ecrit('hors liste : crée une tâche',  $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000001','montage')$q$, 'refusé');
SELECT t.ecrit('hors liste : propose un template', $q$insert into video_templates (nom, type_video) values ('x','y')$q$, 'refusé');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.lit('non connecté : montages',    'select * from video_jobs', 0);
SELECT t.lit('non connecté : aperçus',     'select * from storage.objects', 0);
RESET ROLE;

\echo
\echo '=== 2. Montages (video_jobs) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('crée un montage avec prompt, en trichant sur statut/auteur/progression',
  $q$insert into video_jobs (id, titre, prompt, statut, cree_par, progression, lien_drive_export)
     values ('22222222-0000-0000-0000-000000000002','Digestion','Coupe les silences','termine','hugues@neoperformance.ca',100,'http://x')$q$, '1');
SELECT t.lit('  → valeurs forcées : en_file, info@, 0 %, pas de lien',
  $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000002' and statut='en_file' and cree_par='info@neoperformance.ca' and progression=0 and lien_drive_export is null$q$, 1);
SELECT t.ecrit('crée un montage sans template ni prompt', $q$insert into video_jobs (titre) values ('vide')$q$, 'refusé');
SELECT t.ecrit('crée un montage avec prompt vide (espaces)', $q$insert into video_jobs (titre, prompt) values ('vide','   ')$q$, 'refusé');
SELECT t.ecrit('crée un montage avec un template non approuvé', $q$insert into video_jobs (titre, template_id) values ('x','11111111-0000-0000-0000-000000000002')$q$, 'refusé');
SELECT t.ecrit('crée un montage avec template approuvé, sans prompt', $q$insert into video_jobs (titre, template_id) values ('x','11111111-0000-0000-0000-000000000001')$q$, '1');
SELECT t.ecrit('renomme un montage', $q$update video_jobs set titre='Cortisol v2' where id='22222222-0000-0000-0000-000000000001'$q$, '1');
SELECT t.ecrit('change le statut d''un montage', $q$update video_jobs set statut='termine' where id='22222222-0000-0000-0000-000000000001'$q$, 'refusé');
SELECT t.ecrit('change la progression', $q$update video_jobs set progression=50 where id='22222222-0000-0000-0000-000000000001'$q$, 'refusé');
SELECT t.ecrit('change le lien d''export Drive', $q$update video_jobs set lien_drive_export='http://pirate' where id='22222222-0000-0000-0000-000000000001'$q$, 'refusé');
SELECT t.ecrit('supprime un montage', $q$delete from video_jobs where id='22222222-0000-0000-0000-000000000001'$q$, '0');
RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('met à jour statut/étape/progression/branche', $q$update video_jobs set statut='montage', etape='Coupe des silences', progression=40, branche_git='montage/cortisol', position_file=0 where id='22222222-0000-0000-0000-000000000001'$q$, '1');
SELECT t.ecrit('progression à 150 %', $q$update video_jobs set progression=150 where id='22222222-0000-0000-0000-000000000001'$q$, 'refusé');
RESET ROLE;

\echo
\echo '=== 3. Versions (video_versions) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('insère une version depuis le hub', $q$insert into video_versions (job_id, numero, auteur) values ('22222222-0000-0000-0000-000000000001',2,'hugues@neoperformance.ca')$q$, 'refusé');
SELECT t.ecrit('modifie une version', $q$update video_versions set reponse_agent='truqué'$q$, '0');
SELECT t.ecrit('supprime une version', $q$delete from video_versions$q$, '0');
RESET ROLE; SET ROLE service_role; SELECT set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('insère v2 après commit', $q$insert into video_versions (job_id, numero, commit_git, chemin_apercu, prompt, reponse_agent, auteur) values ('22222222-0000-0000-0000-000000000001',2,'def456','apercus/22222222-0000-0000-0000-000000000001/v2.mp4','Plus court','Coupé à 30 s','info@neoperformance.ca')$q$, '1');
SELECT t.ecrit('insère v2 une 2e fois', $q$insert into video_versions (job_id, numero, auteur) values ('22222222-0000-0000-0000-000000000001',2,'x')$q$, 'refusé');
SELECT t.ecrit('insère v0', $q$insert into video_versions (job_id, numero, auteur) values ('22222222-0000-0000-0000-000000000001',0,'x')$q$, 'refusé');
RESET ROLE;

\echo
\echo '=== 4. Tâches (video_taches) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('demande une correction de sous-titres (en trichant sur statut)', $q$insert into video_taches (id, job_id, type, payload, statut) values ('33333333-0000-0000-0000-000000000001','22222222-0000-0000-0000-000000000001','correction_sous_titres','{"mot":3,"texte":"cortisol"}','fait')$q$, '1');
SELECT t.lit('  → statut forcé en_attente, cree_par info@', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000001' and statut='en_attente' and cree_par='info@neoperformance.ca'$q$, 1);
SELECT t.ecrit('demande de restaurer v1', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000001','restaurer','{"version":1}')$q$, '1');
SELECT t.ecrit('demande terminer', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000001','terminer')$q$, '1');
SELECT t.ecrit('demande une variante', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000001','variante','{"format":"4:5"}')$q$, '1');
SELECT t.ecrit('tâche montage sans job', $q$insert into video_taches (type) values ('montage')$q$, 'refusé');
SELECT t.ecrit('type inconnu', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000001','supprimer_tout')$q$, 'refusé');
SELECT t.ecrit('demande enregistrer_style (réservé à Hugues)', $q$insert into video_taches (type, payload) values ('enregistrer_style','{"template_id":"11111111-0000-0000-0000-000000000001"}')$q$, 'refusé');
SELECT t.ecrit('change le statut d''une tâche', $q$update video_taches set statut='fait'$q$, '0');
SELECT t.ecrit('supprime une tâche', $q$delete from video_taches$q$, '0');
SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('demande enregistrer_style avec template_id', $q$insert into video_taches (type, payload) values ('enregistrer_style','{"template_id":"11111111-0000-0000-0000-000000000001"}')$q$, '1');
SELECT t.ecrit('demande enregistrer_style sans template_id', $q$insert into video_taches (type) values ('enregistrer_style')$q$, 'refusé');
RESET ROLE; SET ROLE service_role; SELECT set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('prend une tâche (en_cours)', $q$update video_taches set statut='en_cours' where id='33333333-0000-0000-0000-000000000001'$q$, '1');
SELECT t.ecrit('prend une 2e tâche en même temps', $q$update video_taches set statut='en_cours' where type='terminer'$q$, 'refusé');
SELECT t.ecrit('termine la 1re tâche', $q$update video_taches set statut='fait' where id='33333333-0000-0000-0000-000000000001'$q$, '1');
SELECT t.ecrit('prend la tâche suivante', $q$update video_taches set statut='en_cours' where type='terminer'$q$, '1');
RESET ROLE;

\echo
\echo '=== 5. Templates (video_templates) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('propose un template en le marquant déjà approuvé', $q$insert into video_templates (id, nom, type_video, statut, propose_par, approuve_par) values ('11111111-0000-0000-0000-000000000009','Tentative','reel-hook','approuve','hugues@neoperformance.ca','hugues@neoperformance.ca')$q$, '1');
SELECT t.lit('  → forcé à propose, au nom de info@, sans approbateur', $q$select 1 from video_templates where id='11111111-0000-0000-0000-000000000009' and statut='propose' and propose_par='info@neoperformance.ca' and approuve_par is null$q$, 1);
SELECT t.lit('  → aucune tâche enregistrer_style créée', $q$select 1 from video_taches where payload->>'template_id'='11111111-0000-0000-0000-000000000009'$q$, 0);
SELECT t.ecrit('approuve sa propre proposition', $q$update video_templates set statut='approuve' where id='11111111-0000-0000-0000-000000000002'$q$, 'refusé');
SELECT t.ecrit('se met approuve_par', $q$update video_templates set approuve_par='hugues@neoperformance.ca' where id='11111111-0000-0000-0000-000000000002'$q$, 'refusé');
SELECT t.ecrit('remplit reference_video_neo', $q$update video_templates set reference_video_neo='skills/x' where id='11111111-0000-0000-0000-000000000002'$q$, 'refusé');
SELECT t.ecrit('renomme sa proposition ouverte', $q$update video_templates set nom='Témoignage client' where id='11111111-0000-0000-0000-000000000002'$q$, '1');
SELECT t.ecrit('renomme un template approuvé', $q$update video_templates set nom='Piraté' where id='11111111-0000-0000-0000-000000000001'$q$, '0');
SELECT t.ecrit('supprime un template approuvé', $q$delete from video_templates where id='11111111-0000-0000-0000-000000000001'$q$, '0');
SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('approuve la proposition de Cloé', $q$update video_templates set statut='approuve' where id='11111111-0000-0000-0000-000000000002'$q$, '1');
SELECT t.lit('  → approuve_par hugues@ et approuve_le rempli', $q$select 1 from video_templates where id='11111111-0000-0000-0000-000000000002' and approuve_par='hugues@neoperformance.ca' and approuve_le is not null$q$, 1);
SELECT t.lit('  → tâche enregistrer_style créée automatiquement', $q$select 1 from video_taches where type='enregistrer_style' and statut='en_attente' and payload->>'template_id'='11111111-0000-0000-0000-000000000002' and cree_par='hugues@neoperformance.ca'$q$, 1);
SELECT t.ecrit('refuse une proposition', $q$update video_templates set statut='refuse' where id='11111111-0000-0000-0000-000000000003'$q$, '1');
SELECT t.lit('  → aucune tâche pour le template refusé', $q$select 1 from video_taches where payload->>'template_id'='11111111-0000-0000-0000-000000000003'$q$, 0);
SELECT t.ecrit('supprime un template utilisé par un montage', $q$delete from video_templates where id='11111111-0000-0000-0000-000000000001'$q$, 'refusé');
RESET ROLE; SET ROLE service_role; SELECT set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('enregistre le style (reference_video_neo, chemin_apercu)', $q$update video_templates set reference_video_neo='.claude/skills/reel-temoignage', chemin_apercu='templates/11111111-0000-0000-0000-000000000002/apercu.mp4' where id='11111111-0000-0000-0000-000000000002'$q$, '1');
RESET ROLE;

\echo
\echo '=== 6. État de l''agent (heartbeat) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('écrit un faux signal', $q$update video_agent_status set dernier_signal=now()$q$, '0');
SELECT t.ecrit('ajoute une 2e ligne', $q$insert into video_agent_status (id) values (2)$q$, 'refusé');
RESET ROLE; SET ROLE service_role; SELECT set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('envoie son signal', $q$update video_agent_status set dernier_signal=now(), version_agent='0.1.0', tache_en_cours=(select id from video_taches where statut='en_cours')$q$, '1');
SELECT t.ecrit('ajoute une 2e ligne', $q$insert into video_agent_status (id) values (2)$q$, 'refusé');
RESET ROLE;

\echo
\echo '=== 7. Stockage (bucket video-apercus) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('dépose un fichier dans video-apercus', $q$insert into storage.objects (bucket_id, name) values ('video-apercus','apercus/x/v9.mp4')$q$, 'refusé');
SELECT t.ecrit('supprime un aperçu', $q$delete from storage.objects where bucket_id='video-apercus'$q$, '0');
RESET ROLE;

\echo
\echo '=== 8. Ajouts phase 1b (20261002112126) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('crée un montage avec nom_source, en trichant sur session_id', $q$insert into video_jobs (id, titre, prompt, nom_source, session_id) values ('22222222-0000-0000-0000-000000000003','Hormones','Monte-la','IMG_1234.MOV','session-pirate')$q$, '1');
SELECT t.lit('  → format 9:16 par défaut, session_id vidé, nom_source gardé', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000003' and format='9:16' and session_id is null and nom_source='IMG_1234.MOV'$q$, 1);
SELECT t.ecrit('crée un montage en 4:5', $q$insert into video_jobs (titre, prompt, format) values ('Carré','x','4:5')$q$, '1');
SELECT t.ecrit('crée un montage en 16:9 (format inconnu)', $q$insert into video_jobs (titre, prompt, format) values ('Large','x','16:9')$q$, 'refusé');
SELECT t.ecrit('change session_id', $q$update video_jobs set session_id='x' where id='22222222-0000-0000-0000-000000000003'$q$, 'refusé');
SELECT t.ecrit('change le format après création', $q$update video_jobs set format='1:1' where id='22222222-0000-0000-0000-000000000003'$q$, 'refusé');
SELECT t.ecrit('propose un template lié à un montage et une version', $q$insert into video_templates (id, nom, type_video, job_id, numero_version) values ('11111111-0000-0000-0000-000000000010','Style Hormones','neo-video-montage','22222222-0000-0000-0000-000000000001',1)$q$, '1');
SELECT t.lit('voit la config', 'select * from video_config', 0);
SELECT t.ecrit('écrit dans la config', $q$insert into video_config (cle, valeur) values ('drive_brut_id','"abc"')$q$, 'refusé');
RESET ROLE; SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('enregistre session_id', $q$update video_jobs set session_id='sess-1' where id='22222222-0000-0000-0000-000000000003'$q$, '1');
SELECT t.ecrit('insère une version avec ses sous-titres', $q$insert into video_versions (job_id, numero, auteur, sous_titres) values ('22222222-0000-0000-0000-000000000003',1,'info@neoperformance.ca','{"mots":[{"texte":"Salut","debutMs":0,"finMs":300}]}')$q$, '1');
SELECT t.ecrit('format 2:3', $q$update video_jobs set format='2:3' where id='22222222-0000-0000-0000-000000000003'$q$, 'refusé');
RESET ROLE; SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('écrit dans la config', $q$insert into video_config (cle, valeur) values ('drive_brut_id','"abc"')$q$, '1');
SELECT t.ecrit('modifie la config', $q$update video_config set valeur='"def"' where cle='drive_brut_id'$q$, '1');
SELECT t.lit('  → valeur modifiée', $q$select 1 from video_config where cle='drive_brut_id' and valeur='"def"'$q$, 1);
SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.lit('voit la config', 'select * from video_config', 1);
SELECT t.ecrit('modifie la config', $q$update video_config set valeur='"pirate"'$q$, '0');
SELECT t.ecrit('supprime la config', $q$delete from video_config$q$, '0');
SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.lit('hors liste : config', 'select * from video_config', 0);
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.lit('non connecté : config', 'select * from video_config', 0);
SELECT t.ecrit('non connecté : écrit la config', $q$insert into video_config (cle) values ('x')$q$, 'refusé');
RESET ROLE;
