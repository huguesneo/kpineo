-- Corbeille : video_supprimer_montage(id) et video_restaurer_montage(id).
-- Joué après 20261003h_montage_video_corbeille.sql.
\pset tuples_only on
\set QUIET on
\pset footer off

-- Appelle la fonction donnée et compare sa réponse (ou « refusé »)
CREATE OR REPLACE FUNCTION t.corbeille(nom text, fn text, id uuid, attendu text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN EXECUTE format('select public.%I($1)', fn) INTO r USING id;
  EXCEPTION WHEN others THEN r := 'refusé (' || SQLERRM || ')'; END;
  RETURN CASE WHEN r = attendu OR (attendu = 'refusé' AND r LIKE 'refusé%')
                   OR (attendu LIKE 'refusé (%' AND r LIKE attendu || '%') THEN 'PASS ' ELSE 'FAIL ' END
         || rpad(current_setting('t.qui', true), 8) || nom || '  →  ' || r;
END $$;
GRANT EXECUTE ON FUNCTION t.corbeille(text, text, uuid, text) TO anon, authenticated, service_role;

\echo
\echo '=== 24. Corbeille : supprimer ==='
SELECT set_config('t.qui','base',false) \g /dev/null
UPDATE video_taches SET statut = 'fait' WHERE statut IN ('en_attente','en_cours');
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante, branche_git, lien_drive_export) VALUES
 ('22222222-0000-0000-0000-000000000050','À jeter','x','termine',2,'montage/50','NEO vidéo/Exports/a.mp4'),
 ('22222222-0000-0000-0000-000000000051','Occupé','x','apercu_pret',1,NULL,NULL),
 ('22222222-0000-0000-0000-000000000052','Occupé par l''agent','x','montage',1,NULL,NULL);
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante, variante_de) VALUES
 ('22222222-0000-0000-0000-000000000053','Variante du jeté','x','apercu_pret',1,'22222222-0000-0000-0000-000000000050');
INSERT INTO video_versions (job_id, numero, chemin_apercu, auteur) VALUES ('22222222-0000-0000-0000-000000000050', 1, '50/v1.mp4', 'agent');
INSERT INTO video_clips (job_id, ordre, role, nom) VALUES ('22222222-0000-0000-0000-000000000050', 1, 'principal', 'Clip 1');
INSERT INTO video_taches (id, job_id, type, payload, statut, cree_par) VALUES
 ('33333333-0000-0000-0000-000000000050','22222222-0000-0000-0000-000000000050','montage','{}','fait','info@neoperformance.ca'),
 ('33333333-0000-0000-0000-000000000051','22222222-0000-0000-0000-000000000051','montage','{"prompt":"x"}','en_attente','info@neoperformance.ca'),
 ('33333333-0000-0000-0000-000000000052','22222222-0000-0000-0000-000000000052','montage','{"prompt":"x"}','en_cours','info@neoperformance.ca');

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.corbeille('supprime un montage sans tâche active', 'video_supprimer_montage', '22222222-0000-0000-0000-000000000050', 'supprime');
SELECT t.lit('  → supprime_le rempli, par info@', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000050' and supprime_le is not null and supprime_par='info@neoperformance.ca'$q$, 1);
SELECT t.lit('  → rien d''autre ne bouge (statut, version, branche, export)', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000050' and statut='termine' and version_courante=2 and branche_git='montage/50' and lien_drive_export='NEO vidéo/Exports/a.mp4'$q$, 1);
SELECT t.lit('  → versions, clips et tâches gardés', $q$select 1 from video_versions where job_id='22222222-0000-0000-0000-000000000050' union all select 1 from video_clips where job_id='22222222-0000-0000-0000-000000000050' union all select 1 from video_taches where job_id='22222222-0000-0000-0000-000000000050'$q$, 3);
SELECT t.lit('  → la variante reste, toujours liée', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000053' and variante_de='22222222-0000-0000-0000-000000000050' and supprime_le is null$q$, 1);
SELECT t.corbeille('supprime une 2e fois', 'video_supprimer_montage', '22222222-0000-0000-0000-000000000050', 'deja_supprime');
SELECT t.corbeille('supprime un montage avec une tâche en attente', 'video_supprimer_montage', '22222222-0000-0000-0000-000000000051', 'refusé (Annule d''abord la demande en cours');
SELECT t.corbeille('supprime un montage avec une tâche en cours', 'video_supprimer_montage', '22222222-0000-0000-0000-000000000052', 'refusé (Annule d''abord la demande en cours');
SELECT t.lit('  → ces deux montages restent hors corbeille', $q$select 1 from video_jobs where id in ('22222222-0000-0000-0000-000000000051','22222222-0000-0000-0000-000000000052') and supprime_le is null$q$, 2);
SELECT t.corbeille('montage inconnu', 'video_supprimer_montage', '22222222-0000-0000-0000-0000000000ff', 'refusé');
SELECT t.ecrit('met supprime_le directement (interdit)', $q$update video_jobs set supprime_le=now() where id='22222222-0000-0000-0000-000000000051'$q$, 'refusé');
SELECT t.ecrit('crée un montage déjà supprimé (colonnes remises à vide)',
  $q$insert into video_jobs (id, titre, prompt, supprime_le, supprime_par) values ('22222222-0000-0000-0000-000000000054','Neuf','x',now(),'hugues@neoperformance.ca')$q$, '1');
SELECT t.lit('  → hors corbeille', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000054' and supprime_le is null and supprime_par is null$q$, 1);
RESET ROLE;

\echo
\echo '=== 25. Corbeille : ni demande, ni variante, ni clip ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.ecrit('demande une correction', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000050','montage','{"prompt":"x"}')$q$, 'refusé');
SELECT t.ecrit('demande une variante', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000050','variante','{"format":"1:1"}')$q$, 'refusé');
SELECT t.ecrit('ajoute un clip', $q$insert into video_clips (job_id, ordre, role, nom) values ('22222222-0000-0000-0000-000000000050', 2, 'broll', 'B-roll')$q$, 'refusé');
SELECT t.ecrit('demande sur la variante (pas dans la corbeille)', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000053','montage','{"prompt":"x"}')$q$, '1');
SELECT t.lit('lit le montage supprimé (corbeille)', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000050'$q$, 1);
RESET ROLE;
SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('l''agent écrit une tâche sur un montage supprimé (pas concerné)', $q$insert into video_taches (job_id, type, payload, statut) values ('22222222-0000-0000-0000-000000000050','montage','{}','fait')$q$, '1');
RESET ROLE;

\echo
\echo '=== 26. Corbeille : restaurer ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.corbeille('restaure le montage', 'video_restaurer_montage', '22222222-0000-0000-0000-000000000050', 'restaure');
SELECT t.lit('  → colonnes vides, reste intact', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000050' and supprime_le is null and supprime_par is null and statut='termine' and version_courante=2$q$, 1);
SELECT t.corbeille('restaure une 2e fois', 'video_restaurer_montage', '22222222-0000-0000-0000-000000000050', 'pas_supprime');
SELECT t.ecrit('  → demande une variante à nouveau', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000050','variante','{"format":"1:1"}')$q$, '1');
SELECT t.corbeille('montage inconnu', 'video_restaurer_montage', '22222222-0000-0000-0000-0000000000ff', 'refusé');
RESET ROLE;

\echo
\echo '=== 27. Corbeille : hors liste, non connecté ==='
SELECT set_config('t.qui','base',false) \g /dev/null
UPDATE video_jobs SET supprime_le = now(), supprime_par = 'hugues@neoperformance.ca' WHERE id = '22222222-0000-0000-0000-000000000054';
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.corbeille('hors liste : supprime', 'video_supprimer_montage', '22222222-0000-0000-0000-000000000053', 'refusé');
SELECT t.corbeille('hors liste : restaure', 'video_restaurer_montage', '22222222-0000-0000-0000-000000000054', 'refusé');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.corbeille('non connecté : supprime', 'video_supprimer_montage', '22222222-0000-0000-0000-000000000053', 'refusé');
SELECT t.corbeille('non connecté : restaure', 'video_restaurer_montage', '22222222-0000-0000-0000-000000000054', 'refusé');
RESET ROLE;
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.lit('  → rien n''a bougé', $q$select 1 from video_jobs where (id='22222222-0000-0000-0000-000000000053' and supprime_le is null) or (id='22222222-0000-0000-0000-000000000054' and supprime_le is not null)$q$, 2);
