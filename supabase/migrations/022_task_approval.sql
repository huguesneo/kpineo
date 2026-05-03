-- ─────────────────────────────────────────────────────────────────────────────
-- 022 — Approbation des tâches secondaires
--
-- Lorsqu'un membre coche une tâche secondaire, elle passe en "pending_approval".
-- L'admin doit approuver pour créditer les points et marquer la tâche terminée.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS pending_approval BOOLEAN NOT NULL DEFAULT false;

-- Index pour la vue admin « approbations en attente »
CREATE INDEX IF NOT EXISTS tasks_pending_approval_idx
  ON public.tasks (pending_approval) WHERE pending_approval = true;

-- ── Points en attente ──────────────────────────────────────────────────────
-- On ajoute une colonne sur user_points pour afficher les pts en attente côté membre.

ALTER TABLE public.user_points
  ADD COLUMN IF NOT EXISTS points_pending INTEGER NOT NULL DEFAULT 0;

-- ── RLS mise à jour ────────────────────────────────────────────────────────
-- Les membres peuvent mettre à jour pending_approval sur leurs propres tâches
-- (la policy existante permet UPDATE sur tasks where user_id = auth.uid()).
-- Rien à changer : la column est couverte par la policy générale.
