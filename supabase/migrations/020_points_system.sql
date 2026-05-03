-- ============================================================
-- Migration 020 — Système de points
-- Tables : user_points, points_transactions, user_points_history
-- Fonction : reset_monthly_points(p_user_id UUID)
-- Realtime activé sur user_points et points_transactions
-- ============================================================

-- ─── TABLE : user_points ─────────────────────────────────────
-- Une ligne par membre. Contient le solde en temps réel.
CREATE TABLE IF NOT EXISTS public.user_points (
  id                    UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id               UUID      NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  points_total          INTEGER   NOT NULL DEFAULT 0,          -- cumul vie entière (jamais reset)
  points_current_month  INTEGER   NOT NULL DEFAULT 0,          -- reset le 1er du mois
  current_streak_days   INTEGER   NOT NULL DEFAULT 0,          -- jours consécutifs de prioritaires complétées
  last_streak_check_date DATE,                                  -- date du dernier calcul streak
  last_monthly_reset    DATE,                                   -- date du dernier reset mensuel
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ─── TABLE : points_transactions ─────────────────────────────
-- Log immuable de chaque mouvement de points.
CREATE TABLE IF NOT EXISTS public.points_transactions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount       INTEGER     NOT NULL,   -- positif ou négatif
  type         TEXT        NOT NULL CHECK (type IN (
                 'task_completed',
                 'task_uncompleted',
                 'redemption',
                 'refund',
                 'monthly_reset'
               )),
  reference_id UUID,                   -- id de la tâche ou de la redemption
  balance_after INTEGER    NOT NULL,   -- points_total après cette transaction
  created_at   TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS points_transactions_user_created_idx
  ON public.points_transactions (user_id, created_at DESC);

-- ─── TABLE : user_points_history ─────────────────────────────
-- Snapshot mensuel agrégé, peuplé automatiquement au monthly_reset.
-- Évite de recalculer depuis points_transactions à chaque affichage.
CREATE TABLE IF NOT EXISTS public.user_points_history (
  id                   UUID    PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id              UUID    NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  year                 INTEGER NOT NULL,
  month                INTEGER NOT NULL,
  points_earned        INTEGER NOT NULL DEFAULT 0,  -- somme des transactions positives du mois
  points_spent         INTEGER NOT NULL DEFAULT 0,  -- somme abs des transactions négatives du mois (hors monthly_reset)
  balance_end_of_month INTEGER NOT NULL DEFAULT 0,  -- snapshot de points_total au moment du reset
  created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, year, month)
);

CREATE INDEX IF NOT EXISTS user_points_history_user_idx
  ON public.user_points_history (user_id, year DESC, month DESC);

-- ─── RLS : user_points ───────────────────────────────────────
ALTER TABLE public.user_points ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total user_points" ON public.user_points
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Membre lit ses propres points" ON public.user_points
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── RLS : points_transactions ───────────────────────────────
ALTER TABLE public.points_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total points_transactions" ON public.points_transactions
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Membre lit ses propres transactions" ON public.points_transactions
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── RLS : user_points_history ───────────────────────────────
ALTER TABLE public.user_points_history ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total user_points_history" ON public.user_points_history
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

CREATE POLICY "Membre lit son propre historique" ON public.user_points_history
  FOR SELECT
  USING (user_id = auth.uid());

-- ─── REALTIME ────────────────────────────────────────────────
ALTER TABLE public.user_points         REPLICA IDENTITY FULL;
ALTER TABLE public.points_transactions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.user_points;
ALTER PUBLICATION supabase_realtime ADD TABLE public.points_transactions;

-- ─── FONCTION : reset_monthly_points ─────────────────────────
-- Appelée via supabase.rpc('reset_monthly_points', { p_user_id })
-- côté client au login/mount si last_monthly_reset < début du mois actuel.
-- SECURITY DEFINER : s'exécute avec les droits du créateur (admin),
-- bypasse RLS → peut écrire dans toutes les tables concernées.
CREATE OR REPLACE FUNCTION public.reset_monthly_points(p_user_id UUID)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_month_start     DATE;
  v_prev_year       INTEGER;
  v_prev_month      INTEGER;
  v_row             public.user_points%ROWTYPE;
  v_earned          INTEGER;
  v_spent           INTEGER;
BEGIN
  v_month_start := DATE_TRUNC('month', CURRENT_DATE)::DATE;

  -- Lire la ligne du membre
  SELECT * INTO v_row
  FROM public.user_points
  WHERE user_id = p_user_id;

  -- Rien à faire si : pas de ligne, ou déjà resetté ce mois-ci
  IF NOT FOUND THEN RETURN; END IF;
  IF v_row.last_monthly_reset IS NOT NULL
     AND v_row.last_monthly_reset >= v_month_start THEN
    RETURN;
  END IF;

  -- Calculer l'année/mois du mois qui vient de se terminer
  v_prev_year  := EXTRACT(YEAR  FROM (v_month_start - INTERVAL '1 day'))::INTEGER;
  v_prev_month := EXTRACT(MONTH FROM (v_month_start - INTERVAL '1 day'))::INTEGER;

  -- Agréger les transactions du mois précédent
  SELECT
    COALESCE(SUM(CASE WHEN amount > 0                          THEN amount       ELSE 0 END), 0),
    COALESCE(SUM(CASE WHEN amount < 0 AND type != 'monthly_reset' THEN ABS(amount) ELSE 0 END), 0)
  INTO v_earned, v_spent
  FROM public.points_transactions
  WHERE user_id = p_user_id
    AND created_at >= (v_month_start - INTERVAL '1 month')
    AND created_at <  v_month_start;

  -- Archiver dans user_points_history (idempotent)
  INSERT INTO public.user_points_history
    (user_id, year, month, points_earned, points_spent, balance_end_of_month)
  VALUES
    (p_user_id, v_prev_year, v_prev_month, v_earned, v_spent, v_row.points_total)
  ON CONFLICT (user_id, year, month) DO NOTHING;

  -- Marquer l'événement reset dans le log de transactions
  INSERT INTO public.points_transactions
    (user_id, amount, type, balance_after)
  VALUES
    (p_user_id, 0, 'monthly_reset', v_row.points_total);

  -- Reset points_current_month (points_total reste intact)
  UPDATE public.user_points
  SET points_current_month = 0,
      last_monthly_reset   = v_month_start,
      updated_at           = NOW()
  WHERE user_id = p_user_id;
END;
$$;
