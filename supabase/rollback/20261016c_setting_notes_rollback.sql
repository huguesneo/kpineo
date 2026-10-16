-- Annule supabase/migrations/20261016c_setting_notes.sql.
-- Les notes déjà envoyées dans GHL y restent ; seules les copies de l'app disparaissent.
DROP TABLE IF EXISTS public.setting_notes;
DELETE FROM public.setting_config WHERE cle = 'proprietaires_exclus';
