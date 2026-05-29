-- Purge server-side des opportunités GHL supprimées
-- Appelée depuis l'Edge Function pour éviter de charger tous les IDs en mémoire
CREATE OR REPLACE FUNCTION public.purge_deleted_ghl_opportunities(
  p_location_id TEXT,
  p_active_ids  TEXT[]
)
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  deleted_count INTEGER;
BEGIN
  DELETE FROM public.ghl_opportunities
  WHERE location_id = p_location_id
    AND ghl_id <> ALL(p_active_ids);

  GET DIAGNOSTICS deleted_count = ROW_COUNT;
  RETURN deleted_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.purge_deleted_ghl_opportunities(TEXT, TEXT[]) TO service_role;
