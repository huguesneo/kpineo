-- Annulation d'une tâche (bouton « Annuler ») : video_annuler_tache(id).
-- Joué après 20261003g_montage_video_annulation.sql.
\pset tuples_only on
\set QUIET on
\pset footer off

-- Appelle video_annuler_tache et compare sa réponse (ou « refusé »)
CREATE OR REPLACE FUNCTION t.annule(nom text, id uuid, attendu text) RETURNS text LANGUAGE plpgsql AS $$
DECLARE r text;
BEGIN
  BEGIN r := public.video_annuler_tache(id);
  EXCEPTION WHEN others THEN r := 'refusé (' || SQLERRM || ')'; END;
  RETURN CASE WHEN r = attendu OR (attendu = 'refusé' AND r LIKE 'refusé%') THEN 'PASS ' ELSE 'FAIL ' END
         || rpad(current_setting('t.qui', true), 8) || nom || '  →  ' || r;
END $$;
GRANT EXECUTE ON FUNCTION t.annule(text, uuid, text) TO anon, authenticated, service_role;

\echo
\echo '=== 19. Annulation : tâche en attente ==='
SELECT set_config('t.qui','base',false) \g /dev/null
-- File vide au départ (les tests d'avant laissent des tâches actives)
UPDATE video_taches SET statut = 'fait' WHERE statut IN ('en_attente','en_cours');
INSERT INTO video_jobs (id, titre, prompt, statut, version_courante, position_file) VALUES
 ('22222222-0000-0000-0000-000000000040','Nouveau','Monte-le','en_file',0,1),
 ('22222222-0000-0000-0000-000000000041','Avec versions','x','apercu_pret',2,2),
 ('22222222-0000-0000-0000-000000000042','Troisième','x','apercu_pret',1,3);
INSERT INTO video_taches (id, job_id, type, payload, statut, cree_par, created_at) VALUES
 ('33333333-0000-0000-0000-000000000040','22222222-0000-0000-0000-000000000040','montage','{}','en_attente','info@neoperformance.ca', now() - interval '3 min'),
 ('33333333-0000-0000-0000-000000000041','22222222-0000-0000-0000-000000000041','montage','{"prompt":"Plus court"}','en_attente','info@neoperformance.ca', now() - interval '2 min'),
 ('33333333-0000-0000-0000-000000000042','22222222-0000-0000-0000-000000000042','terminer','{}','en_attente','hugues@neoperformance.ca', now() - interval '1 min');

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.annule('annule le premier montage (en attente)', '33333333-0000-0000-0000-000000000040', 'annulee');
SELECT t.lit('  → tâche annulee, par info@, annulee_le rempli', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000040' and statut='annulee' and annulation_demandee_par='info@neoperformance.ca' and annulee_le is not null and annulation_demandee_le is not null$q$, 1);
SELECT t.lit('  → montage v0 en erreur « annulé », sans position', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000040' and statut='erreur' and erreur like 'Montage annulé%' and position_file is null$q$, 1);
SELECT t.lit('  → les suivants avancent dans la file (1, 2)', $q$select 1 from video_jobs where (id='22222222-0000-0000-0000-000000000041' and position_file=1) or (id='22222222-0000-0000-0000-000000000042' and position_file=2)$q$, 2);
SELECT t.annule('annule une demande sur un montage qui a des versions', '33333333-0000-0000-0000-000000000041', 'annulee');
SELECT t.lit('  → montage intact (apercu_pret, v2, sans erreur)', $q$select 1 from video_jobs where id='22222222-0000-0000-0000-000000000041' and statut='apercu_pret' and version_courante=2 and erreur is null and position_file is null$q$, 1);
SELECT t.annule('annule une 2e fois', '33333333-0000-0000-0000-000000000041', 'deja_finie');
SELECT t.annule('tâche inconnue', '33333333-0000-0000-0000-0000000000ff', 'refusé');
SELECT t.ecrit('Terminer annulé libère l''ajout de clips : annule le Terminer', $q$select video_annuler_tache('33333333-0000-0000-0000-000000000042')$q$, '1');
SELECT t.ecrit('  → ajoute un clip au montage', $q$insert into video_clips (job_id, ordre, role, nom) values ('22222222-0000-0000-0000-000000000042', 1, 'principal', 'Nouveau clip')$q$, '1');
SELECT t.ecrit('modifie une tâche directement (toujours interdit)', $q$update video_taches set statut='annulee' where id='33333333-0000-0000-0000-000000000040'$q$, '0');
SELECT t.ecrit('crée une tâche déjà annulée (forcée en_attente, sans annulation)',
  $q$insert into video_taches (id, job_id, type, payload, statut, annulation_demandee_le, annulation_demandee_par, annulee_le) values ('33333333-0000-0000-0000-000000000043','22222222-0000-0000-0000-000000000041','montage','{"prompt":"x"}','annulee',now(),'hugues@neoperformance.ca',now())$q$, '1');
SELECT t.lit('  → en_attente, colonnes d''annulation vides', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000043' and statut='en_attente' and annulation_demandee_le is null and annulation_demandee_par is null and annulee_le is null$q$, 1);
RESET ROLE;

\echo
\echo '=== 20. Annulation : l''agent prend la tâche en même temps ==='
SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.ecrit('prend une tâche annulée', $q$update video_taches set statut='en_cours' where id='33333333-0000-0000-0000-000000000040' and statut='en_attente'$q$, '0');
SELECT t.ecrit('prend la tâche en attente', $q$update video_taches set statut='en_cours' where id='33333333-0000-0000-0000-000000000043' and statut='en_attente'$q$, '1');
RESET ROLE;

\echo
\echo '=== 21. Annulation : tâche en cours (demande pour l''agent) ==='
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.annule('demande l''annulation d''une tâche en cours', '33333333-0000-0000-0000-000000000043', 'demandee');
SELECT t.lit('  → toujours en_cours, demande au nom de hugues@, pas annulee_le', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000043' and statut='en_cours' and annulation_demandee_par='hugues@neoperformance.ca' and annulation_demandee_le is not null and annulee_le is null$q$, 1);
SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.annule('redemande (déjà demandée, auteur gardé)', '33333333-0000-0000-0000-000000000043', 'deja_demandee');
SELECT t.lit('  → toujours au nom de hugues@', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000043' and annulation_demandee_par='hugues@neoperformance.ca'$q$, 1);
RESET ROLE;

SET ROLE service_role; SELECT set_config('request.jwt.claims','{"role":"service_role"}',false), set_config('t.qui','agent',false) \g /dev/null
SELECT t.lit('lit la demande', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000043' and annulation_demandee_le is not null$q$, 1);
SELECT t.ecrit('s''arrête : écrit annulee', $q$update video_taches set statut='annulee', annulee_le=now() where id='33333333-0000-0000-0000-000000000043'$q$, '1');
SELECT t.ecrit('  → le verrou est libre : prend une autre tâche', $q$insert into video_taches (id, job_id, type, payload, statut) values ('33333333-0000-0000-0000-000000000044','22222222-0000-0000-0000-000000000041','restaurer','{"version":1}','en_cours')$q$, '1');
RESET ROLE;

SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.annule('annule une tâche annulée par l''agent', '33333333-0000-0000-0000-000000000043', 'deja_finie');
RESET ROLE;
SELECT set_config('t.qui','base',false) \g /dev/null
UPDATE video_taches SET statut = 'fait' WHERE id = '33333333-0000-0000-0000-000000000044';

\echo
\echo '=== 22. Annulation : enregistrer_style, Hugues seulement ==='
INSERT INTO video_taches (id, type, payload, statut, cree_par) VALUES
 ('33333333-0000-0000-0000-000000000045','enregistrer_style','{"template_id":"11111111-0000-0000-0000-000000000001"}','en_attente','hugues@neoperformance.ca');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.annule('annule l''enregistrement d''un style', '33333333-0000-0000-0000-000000000045', 'refusé');
SELECT t.lit('  → toujours en attente', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000045' and statut='en_attente'$q$, 1);
SELECT set_config('request.jwt.claims','{"email":"hugues@neoperformance.ca"}',false), set_config('t.qui','hugues',false) \g /dev/null
SELECT t.annule('annule l''enregistrement d''un style', '33333333-0000-0000-0000-000000000045', 'annulee');

\echo
\echo '=== 23. Annulation : hors liste, non connecté ==='
SELECT set_config('t.qui','base',false) \g /dev/null
RESET ROLE;
INSERT INTO video_taches (id, job_id, type, payload, statut) VALUES
 ('33333333-0000-0000-0000-000000000046','22222222-0000-0000-0000-000000000041','montage','{"prompt":"y"}','en_attente');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"jason@neoperformance.ca"}',false), set_config('t.qui','jason',false) \g /dev/null
SELECT t.annule('hors liste : annule une tâche', '33333333-0000-0000-0000-000000000046', 'refusé');
RESET ROLE; SET ROLE anon; SELECT set_config('request.jwt.claims','',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.annule('non connecté : annule une tâche', '33333333-0000-0000-0000-000000000046', 'refusé');
RESET ROLE;
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.lit('  → toujours en attente', $q$select 1 from video_taches where id='33333333-0000-0000-0000-000000000046' and statut='en_attente'$q$, 1);
