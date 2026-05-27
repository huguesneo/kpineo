-- Schedule overrides
-- Members can request a full schedule adjustment for a date range
-- They specify start/end times per working day; total hours must match expected
-- Admin approval required; approved overrides take priority over the regular schedule
-- When the end_date passes, the regular schedule automatically resumes

CREATE TABLE schedule_overrides (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  -- JSON array of { date, start_time, end_time, hours } for each working day in range
  days JSONB NOT NULL DEFAULT '[]',
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE schedule_overrides ENABLE ROW LEVEL SECURITY;

CREATE POLICY "overrides_admin" ON schedule_overrides
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "overrides_member_read" ON schedule_overrides
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "overrides_member_insert" ON schedule_overrides
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "overrides_member_delete" ON schedule_overrides
  FOR DELETE USING (user_id = auth.uid() AND status != 'approved');
