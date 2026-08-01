-- ============================================================================
-- Seed du compte Facebook dans social_accounts — manquant jusqu'ici, ce qui
-- explique que social_publications n'ait jamais eu de ligne 'facebook' :
-- le sync n'avait aucun compte Facebook à interroger.
-- external_id = Page ID Meta natif (confirmé via GHL social-media-posting
-- accounts : originId du compte platform=facebook = 1581741725486806).
-- ============================================================================

INSERT INTO public.social_accounts (platform, external_id, handle, display_name, timezone, is_active)
VALUES ('facebook', '1581741725486806', 'neoperformance', 'Neo Performance - Naturopathe', 'America/Toronto', true)
ON CONFLICT (platform, external_id) DO NOTHING;
