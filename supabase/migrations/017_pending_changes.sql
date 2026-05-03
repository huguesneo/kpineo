CREATE TABLE IF NOT EXISTS public.pending_changes (
  id            UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id       UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  entity_type   TEXT        NOT NULL CHECK (entity_type IN ('absence', 'schedule')),
  action        TEXT        NOT NULL CHECK (action IN ('modify', 'delete')),
  record_id     UUID        NOT NULL,
  proposed_data JSONB,                   -- null pour delete, nouvelles valeurs pour modify
  status        TEXT        NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  reviewed_by   UUID        REFERENCES public.profiles(id),
  reviewed_at   TIMESTAMPTZ,
  created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.pending_changes ENABLE ROW LEVEL SECURITY;

-- Admin : accès complet
CREATE POLICY "Admin full access pending_changes"
  ON public.pending_changes FOR ALL TO authenticated
  USING (public.is_admin()) WITH CHECK (public.is_admin());

-- Membre : voir et créer les siennes
CREATE POLICY "Member select own pending_changes"
  ON public.pending_changes FOR SELECT TO authenticated
  USING (user_id = auth.uid());

CREATE POLICY "Member insert own pending_changes"
  ON public.pending_changes FOR INSERT TO authenticated
  WITH CHECK (user_id = auth.uid());

-- Membre : supprimer ses propres demandes en attente (annuler)
CREATE POLICY "Member delete own pending pending_changes"
  ON public.pending_changes FOR DELETE TO authenticated
  USING (user_id = auth.uid() AND status = 'pending');
