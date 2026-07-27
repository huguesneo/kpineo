-- ─── Taux de commission closer individuel ────────────────────────────────────
-- profiles.closer_commission_rate : fraction (0.086 = 8,6 %).
-- NULL  = on applique le taux global (COMMISSION_RATE dans src/lib/ghlHelpers.js).
-- Rétroactif : le taux courant s'applique à toutes les périodes, y compris passées,
-- puisque la commission est recalculée à chaque affichage.
-- Écriture réservée à hugues@neoperformance.ca (les autres admins gardent l'accès
-- au reste du profil) — garde appliquée par trigger, pas par RLS, car RLS ne sait
-- pas restreindre une colonne précise.

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS closer_commission_rate NUMERIC;

ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_closer_commission_rate_check;

ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_closer_commission_rate_check
  CHECK (closer_commission_rate IS NULL
         OR (closer_commission_rate >= 0 AND closer_commission_rate <= 1));

COMMENT ON COLUMN public.profiles.closer_commission_rate IS
  'Taux de commission closing individuel, en fraction (0.086 = 8,6 %). NULL = taux global. Modifiable uniquement par hugues@neoperformance.ca.';

-- SECURITY INVOKER volontairement : on veut le rôle réel de l''appelant
-- (authenticated / service_role) dans current_user, pas le propriétaire.
CREATE OR REPLACE FUNCTION public.guard_closer_commission_rate()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  changed BOOLEAN;
BEGIN
  changed := CASE
    WHEN TG_OP = 'INSERT' THEN NEW.closer_commission_rate IS NOT NULL
    ELSE NEW.closer_commission_rate IS DISTINCT FROM OLD.closer_commission_rate
  END;

  IF changed
     AND NOT public.is_hugues()
     AND current_user NOT IN ('postgres', 'service_role', 'supabase_admin') THEN
    RAISE EXCEPTION 'Seul hugues@neoperformance.ca peut modifier le taux de commission closer';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_closer_commission_rate_guard ON public.profiles;
CREATE TRIGGER trg_closer_commission_rate_guard
  BEFORE INSERT OR UPDATE ON public.profiles
  FOR EACH ROW EXECUTE FUNCTION public.guard_closer_commission_rate();
