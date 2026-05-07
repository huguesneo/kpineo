-- Mode punch : heures variables saisies manuellement par journée

ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS punch_mode BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS public.daily_punch_entries (
  id         UUID          PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id    UUID          NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  date       DATE          NOT NULL,
  hours      NUMERIC(5,2)  NOT NULL CHECK (hours >= 0 AND hours <= 24),
  notes      TEXT,
  created_at TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
  UNIQUE (user_id, date)
);

ALTER TABLE public.daily_punch_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Punch entries : membre et admin" ON public.daily_punch_entries
  FOR ALL TO authenticated USING (
    auth.uid() = user_id
    OR EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin')
  );
