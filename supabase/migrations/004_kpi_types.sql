-- =============================================
-- Table des types de KPI (gérables par l'admin)
-- =============================================
CREATE TABLE IF NOT EXISTS public.kpi_types (
  id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
  label TEXT NOT NULL,
  value TEXT NOT NULL UNIQUE,
  role_scope TEXT NOT NULL DEFAULT 'all',
  -- 'all' = tous les rôles, 'naturopathe', 'closer', 'setter', 'clinic'
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

ALTER TABLE public.kpi_types ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin gère les types KPI" ON public.kpi_types
  FOR ALL USING (public.is_admin());

CREATE POLICY "Tout le monde lit les types KPI actifs" ON public.kpi_types
  FOR SELECT USING (is_active = true);

-- Types par défaut
INSERT INTO public.kpi_types (label, value, role_scope) VALUES
  ('Revenus ($)', 'monthly_revenue', 'naturopathe'),
  ('Consultations', 'monthly_consultations', 'naturopathe'),
  ('Revenus trimestriels ($)', 'quarterly_revenue', 'naturopathe'),
  ('Consultations trimestrielles', 'quarterly_consultations', 'naturopathe'),
  ('Appels', 'daily_calls', 'all'),
  ('Closes', 'daily_closes', 'closer'),
  ('Rendez-vous bookés', 'daily_bookings', 'setter'),
  ('Revenu clinique ($)', 'clinic_revenue', 'clinic')
ON CONFLICT (value) DO NOTHING;
