-- Timeline ouverte aux vidéos d'une cliente (20261015c). Joué après 90 et 91.
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 33. Timeline : une cliente ==='
SELECT set_config('t.qui','base',false) \g /dev/null
UPDATE video_taches SET statut = 'fait' WHERE statut IN ('en_attente','en_cours');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.ecrit('timeline_preparer pour une cliente (permis)', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000071','timeline_preparer')$q$, '1');
SELECT t.ecrit('timeline_appliquer pour une cliente (permis)', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000071','timeline_appliquer')$q$, '1');
SELECT t.ecrit('Monter moi-même pour une cliente (permis)', $q$insert into video_taches (job_id, type, payload) values ('22222222-0000-0000-0000-000000000071','montage','{"manuel":true}')$q$, '1');
SELECT t.ecrit('vérification pour une cliente (permise)', $q$insert into video_timeline_requetes (job_id, type, recette, statut, reponse) values ('22222222-0000-0000-0000-000000000071','verifier','{"version":1}','fait','{"faux":true}')$q$, '1');
SELECT t.lit('  → née en_attente, sans réponse, au nom de info@', $q$select 1 from video_timeline_requetes where job_id='22222222-0000-0000-0000-000000000071' and statut='en_attente' and reponse is null and cree_par='info@neoperformance.ca'$q$, 1);
SELECT t.ecrit('recette de plus de 1 Mo (toujours refusée)', $q$insert into video_timeline_requetes (job_id, type, recette) values ('22222222-0000-0000-0000-000000000071','verifier',jsonb_build_object('x', repeat('a', 1100000)))$q$, 'refusé');
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"autre@neoperformance.ca"}',false), set_config('t.qui','autre',false) \g /dev/null
SELECT t.ecrit('autre compte : timeline d''une cliente', $q$insert into video_taches (job_id, type) values ('22222222-0000-0000-0000-000000000071','timeline_preparer')$q$, 'refusé');
SELECT t.ecrit('autre compte : vérification d''une cliente', $q$insert into video_timeline_requetes (job_id, type, recette) values ('22222222-0000-0000-0000-000000000071','verifier','{}')$q$, 'refusé');
RESET ROLE;
