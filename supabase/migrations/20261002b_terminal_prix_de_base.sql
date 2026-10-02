-- Terminal : prix de base préremplis par produit (modifiables seulement par hugues@neoperformance.ca)
CREATE TABLE IF NOT EXISTS public.terminal_base_prices (
  price_key    TEXT PRIMARY KEY,
  label        TEXT NOT NULL,
  amount_cents INTEGER NOT NULL DEFAULT 0 CHECK (amount_cents >= 0),
  updated_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.terminal_base_prices ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Prix de base lisibles" ON public.terminal_base_prices;
CREATE POLICY "Prix de base lisibles" ON public.terminal_base_prices FOR SELECT TO authenticated USING (true);
DROP POLICY IF EXISTS "Prix de base modifiables par Hugues" ON public.terminal_base_prices;
CREATE POLICY "Prix de base modifiables par Hugues" ON public.terminal_base_prices FOR UPDATE TO authenticated
  USING (lower(auth.jwt()->>'email') = 'hugues@neoperformance.ca')
  WITH CHECK (lower(auth.jwt()->>'email') = 'hugues@neoperformance.ca');
INSERT INTO public.terminal_base_prices (price_key, label, amount_cents) VALUES
  ('forfait_neo', 'Forfait 15 semaines NEO (1, 3 ou 5 paiements)', 240000),
  ('Évaluation naturopathie', 'Évaluation naturopathie', 55000),
  ('Évaluation entrainement', 'Évaluation entrainement', 55000)
ON CONFLICT (price_key) DO NOTHING;
