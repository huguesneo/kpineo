-- Ajoute le GHL user_id sur les profils (pour lier les closers à leurs RDV GHL)
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS ghl_user_id TEXT DEFAULT NULL;
