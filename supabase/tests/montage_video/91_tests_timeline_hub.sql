-- Timeline du hub : catalogue et polices dans hub/ (20261015b).
\pset tuples_only on
\set QUIET on
\pset footer off

\echo
\echo '=== 32. Bucket video-timeline : catalogue et polices ==='
SELECT set_config('t.qui','base',false) \g /dev/null
SELECT t.lit('polices acceptées (font/otf)', $q$select 1 from storage.buckets where id='video-timeline' and 'font/otf' = any(allowed_mime_types)$q$, 1);
SELECT t.lit('  → types d''avant gardés', $q$select 1 from storage.buckets where id='video-timeline' and allowed_mime_types @> array['video/mp4','image/png','application/json','audio/mpeg']$q$, 1);
SELECT t.lit('  → bucket toujours privé', $q$select 1 from storage.buckets where id='video-timeline' and public = false$q$, 1);
INSERT INTO storage.objects (bucket_id, name) VALUES
 ('video-timeline','hub/catalogue.json'),
 ('video-timeline','hub/polices/AllrounderGroteskTest-Black.otf');
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"info@neoperformance.ca"}',false), set_config('t.qui','info',false) \g /dev/null
SELECT t.lit('info@ lit hub/, montages/ et sons/ (pas ailleurs/)', $q$select 1 from storage.objects where bucket_id='video-timeline'$q$, 4);
RESET ROLE;
SET ROLE authenticated; SELECT set_config('request.jwt.claims','{"email":"autre@neoperformance.ca"}',false), set_config('t.qui','autre',false) \g /dev/null
SELECT t.lit('autre compte : ne lit pas hub/', $q$select 1 from storage.objects where bucket_id='video-timeline' and name like 'hub/%'$q$, 0);
RESET ROLE;
SET ROLE anon; SELECT set_config('request.jwt.claims','{}',false), set_config('t.qui','anon',false) \g /dev/null
SELECT t.lit('anonyme : ne lit pas hub/', $q$select 1 from storage.objects where bucket_id='video-timeline' and name like 'hub/%'$q$, 0);
RESET ROLE;
