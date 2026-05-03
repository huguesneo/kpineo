-- ============================================================
-- Migration 019 — Nouveaux champs sur tasks
-- task_type : 'recurrente' | 'ponctuelle'
-- points    : nb de points gagnés à la complétion (secondaires seulement)
-- priority_order : tri dans chaque section (0 = premier affiché)
-- ============================================================

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS task_type TEXT NOT NULL DEFAULT 'ponctuelle'
    CHECK (task_type IN ('recurrente', 'ponctuelle')),
  ADD COLUMN IF NOT EXISTS points INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS priority_order INTEGER NOT NULL DEFAULT 0;

-- Backfill : tâches avec recurrence_rule → recurrente
UPDATE public.tasks
SET task_type = 'recurrente'
WHERE recurrence_rule IS NOT NULL;

-- Index pour le tri des ponctuelles par section
CREATE INDEX IF NOT EXISTS tasks_priority_order_idx
  ON public.tasks (user_id, priority, task_type, priority_order);
