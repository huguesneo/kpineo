CREATE TABLE IF NOT EXISTS closer_client_assignments (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  closer_name text NOT NULL,
  client_name text NOT NULL,
  client_name_lower text NOT NULL,
  first_close_date date,
  created_at timestamptz DEFAULT now(),
  UNIQUE(closer_name, client_name_lower)
);

CREATE INDEX IF NOT EXISTS idx_cca_closer ON closer_client_assignments(closer_name);
