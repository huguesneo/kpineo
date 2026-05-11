-- Suivi des paiements multi-versements par client/produit/closer
-- Une ligne = un reçu QB pour un produit commissonnable
-- Permet de détecter automatiquement les paiements 2, 3, 4, 5 comme "récurrents"

CREATE TABLE IF NOT EXISTS closer_payment_tracking (
  id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  qb_receipt_id         text NOT NULL,
  qb_customer_name      text NOT NULL,
  qb_customer_name_lower text NOT NULL,
  product_name          text NOT NULL,
  closer_name           text NOT NULL,           -- prénom minuscule du closer
  total_payments        integer NOT NULL DEFAULT 1,
  payment_number        integer NOT NULL DEFAULT 1,  -- 1 = premier, 2 = deuxième, etc.
  txn_date              date NOT NULL,
  amount                numeric NOT NULL DEFAULT 0,
  created_at            timestamptz DEFAULT now(),

  UNIQUE(qb_receipt_id, product_name)
);

CREATE INDEX IF NOT EXISTS idx_cpt_customer_product
  ON closer_payment_tracking (qb_customer_name_lower, product_name);

CREATE INDEX IF NOT EXISTS idx_cpt_closer_date
  ON closer_payment_tracking (closer_name, txn_date);

-- RLS : lecture pour les membres authentifiés, écriture uniquement service_role
ALTER TABLE closer_payment_tracking ENABLE ROW LEVEL SECURITY;

CREATE POLICY "closer_payment_tracking_read"
  ON closer_payment_tracking FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "closer_payment_tracking_service_write"
  ON closer_payment_tracking FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
