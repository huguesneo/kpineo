-- Annule supabase/migrations/20261016b_setting_rdv_reserve.sql.
-- À exécuter AVANT 20261016a_setting_v2_rollback.sql si on annule tout.
DROP TRIGGER IF EXISTS trg_setting_rdv_reserve ON public.ghl_appointments;
DROP FUNCTION IF EXISTS public.setting_rdv_reserve();
