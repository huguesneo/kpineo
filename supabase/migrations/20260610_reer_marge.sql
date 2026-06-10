-- =============================================================================
-- REER — 4e condition : marge individuelle du naturo >= son seuil personnel
-- + objectif 12 mois (date de début) pour suivre la progression sur 1 an
-- =============================================================================

-- Seuils de marge (%) par naturo
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS marge_seuil_thibault numeric(5,2) DEFAULT 15.0;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS marge_seuil_brice    numeric(5,2) DEFAULT 15.0;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS marge_seuil_jessica  numeric(5,2) DEFAULT 12.0;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS marge_seuil_tamara   numeric(5,2) DEFAULT 12.0;

-- Date de début de l'objectif 12 mois par naturo (fenêtre de progression d'1 an)
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS objectif_debut_thibault date;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS objectif_debut_brice    date;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS objectif_debut_jessica  date;
ALTER TABLE public.neo_performance_params ADD COLUMN IF NOT EXISTS objectif_debut_tamara   date;

-- Historique des changements de seuil de marge
CREATE TABLE IF NOT EXISTS public.neo_reer_marge_historique (
  id uuid primary key default gen_random_uuid(),
  naturo text not null check (naturo in ('thibault','brice','jessica','tamara')),
  ancien_seuil numeric(5,2),
  nouveau_seuil numeric(5,2),
  date_effet date not null,
  note text,
  created_at timestamp with time zone default now()
);

ALTER TABLE public.neo_reer_marge_historique ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Hugues gère l'historique des marges" ON public.neo_reer_marge_historique;
CREATE POLICY "Hugues gère l'historique des marges" ON public.neo_reer_marge_historique
  FOR ALL USING (public.is_hugues()) WITH CHECK (public.is_hugues());
