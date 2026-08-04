-- Couverture personnalisée d'un reel : URL d'une image téléversée dans le
-- bucket social-media, envoyée à GHL comme media[].thumbnail à la publication.
alter table social_posts add column if not exists thumbnail_url text;

comment on column social_posts.thumbnail_url is
  'Image de couverture du reel (bucket social-media). Ignorée par TikTok.';
