-- Setting v2 : RDV découverte réservé → fin du rappel (tag rappel-manuel,
-- date_rappel, tâche). Le webhook APP-03 écrit le RDV dans ghl_appointments
-- (ghl-webhook, inchangé) ; ce déclencheur appelle setting-rdv en arrière-plan
-- (pg_net, asynchrone). Il ne peut jamais bloquer l'écriture du RDV : toute
-- erreur est avalée. Purement additif. Annulation :
-- supabase/rollback/20261016b_setting_rdv_reserve_rollback.sql

CREATE OR REPLACE FUNCTION public.setting_rdv_reserve()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  BEGIN
    IF NEW.contact_id IS NOT NULL
       AND NEW.calendar_id IN ('DIN6EPtG7eNU3Gf6ZRoC', 'ucyJmhYKKDDm7U5JmaJ8', '4227QzeKvFczi5BZyHOC')
       AND NEW.status IN ('new', 'confirmed')
       AND NEW.start_time > now()
       AND (TG_OP = 'INSERT' OR OLD.status IS DISTINCT FROM NEW.status OR OLD.start_time IS DISTINCT FROM NEW.start_time)
       -- Rien à faire si le contact n'a ni rappel actif ni tag rappel-manuel
       AND (EXISTS (SELECT 1 FROM public.setting_rappels r WHERE r.contact_id = NEW.contact_id AND r.statut = 'actif')
            OR EXISTS (SELECT 1 FROM public.ghl_contacts c WHERE c.ghl_id = NEW.contact_id AND 'rappel-manuel' = ANY(c.tags)))
    THEN
      PERFORM net.http_post(
        url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/setting-rdv',
        body    := jsonb_build_object('contactId', NEW.contact_id),
        headers := '{"Content-Type":"application/json"}'::jsonb
      );
    END IF;
  EXCEPTION WHEN OTHERS THEN
    -- Ne jamais bloquer l'écriture du RDV (synchronisation GHL)
    RAISE WARNING 'setting_rdv_reserve : %', SQLERRM;
  END;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_setting_rdv_reserve ON public.ghl_appointments;
CREATE TRIGGER trg_setting_rdv_reserve
  AFTER INSERT OR UPDATE OF status, start_time ON public.ghl_appointments
  FOR EACH ROW EXECUTE FUNCTION public.setting_rdv_reserve();
