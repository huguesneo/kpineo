-- Daily schedule adjustments
-- Members can request to adjust hours for a specific day (finish early or work extra)
-- Extra hours (delta > 0) go to a "bank" capped at 2h
-- Bank hours can be applied to compensate for early finishes
-- All adjustments require admin approval

CREATE TABLE schedule_adjustments (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  date DATE NOT NULL,
  adjusted_hours NUMERIC(4,2) NOT NULL CHECK (adjusted_hours >= 0 AND adjusted_hours <= 24),
  normal_hours NUMERIC(4,2) NOT NULL CHECK (normal_hours >= 0),
  bank_hours_applied NUMERIC(4,2) NOT NULL DEFAULT 0 CHECK (bank_hours_applied >= 0),
  notes TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected')),
  rejection_reason TEXT,
  reviewed_by UUID REFERENCES profiles(id),
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(user_id, date)
);

ALTER TABLE schedule_adjustments ENABLE ROW LEVEL SECURITY;

CREATE POLICY "adj_admin" ON schedule_adjustments
  FOR ALL USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );

CREATE POLICY "adj_member_read" ON schedule_adjustments
  FOR SELECT USING (user_id = auth.uid());

CREATE POLICY "adj_member_insert" ON schedule_adjustments
  FOR INSERT WITH CHECK (user_id = auth.uid());

CREATE POLICY "adj_member_delete" ON schedule_adjustments
  FOR DELETE USING (user_id = auth.uid() AND status != 'approved');
