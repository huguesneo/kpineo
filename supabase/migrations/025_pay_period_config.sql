-- Pay period configuration table
-- Single-row table: admin sets reference_pay_date (a Thursday pay day)
-- All periods are calculated from this anchor bi-weekly

CREATE TABLE pay_period_config (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  reference_pay_date DATE NOT NULL,
  period_length_days INTEGER NOT NULL DEFAULT 14,
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  updated_by UUID REFERENCES profiles(id)
);

-- Seed with first known pay date (May 14, 2026)
INSERT INTO pay_period_config (reference_pay_date, period_length_days)
VALUES ('2026-05-14', 14);

ALTER TABLE pay_period_config ENABLE ROW LEVEL SECURITY;

-- Everyone (authenticated) can read the config
CREATE POLICY "pay_period_config_read" ON pay_period_config
  FOR SELECT USING (auth.role() = 'authenticated');

-- Only admins can update
CREATE POLICY "pay_period_config_admin_update" ON pay_period_config
  FOR UPDATE USING (
    EXISTS (SELECT 1 FROM profiles WHERE id = auth.uid() AND role = 'admin')
  );
