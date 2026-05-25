-- Colonnes UTM (attribution first-touch) sur les contacts GHL
ALTER TABLE public.ghl_contacts ADD COLUMN IF NOT EXISTS utm_campaign TEXT DEFAULT '';
ALTER TABLE public.ghl_contacts ADD COLUMN IF NOT EXISTS utm_content  TEXT DEFAULT '';
ALTER TABLE public.ghl_contacts ADD COLUMN IF NOT EXISTS utm_source   TEXT DEFAULT '';

-- Index (lowercase) pour le croisement avec les noms de campagnes/ads Meta
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_utm_campaign ON public.ghl_contacts (lower(utm_campaign));
CREATE INDEX IF NOT EXISTS idx_ghl_contacts_utm_content  ON public.ghl_contacts (lower(utm_content));
