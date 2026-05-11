-- Remplit les contact_name vides dans ghl_appointments depuis ghl_contacts
-- Appelée par l'edge function après chaque sync de rendez-vous.

CREATE OR REPLACE FUNCTION public.fill_appointment_contact_names()
RETURNS integer AS $$
DECLARE
  updated_count integer;
BEGIN
  UPDATE ghl_appointments a
  SET contact_name = TRIM(c.first_name || ' ' || c.last_name)
  FROM ghl_contacts c
  WHERE a.contact_id = c.ghl_id
    AND (a.contact_name = '' OR a.contact_name IS NULL)
    AND (c.first_name != '' OR c.last_name != '');

  GET DIAGNOSTICS updated_count = ROW_COUNT;
  RETURN updated_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

GRANT EXECUTE ON FUNCTION public.fill_appointment_contact_names() TO service_role;
