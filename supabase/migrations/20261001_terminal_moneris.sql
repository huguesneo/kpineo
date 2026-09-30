-- Terminal de paiement Moneris (closeurs)
--
-- Un plan = une vente : client, produit QuickBooks choisi par le closeur,
-- montant total, versements, fréquence, date de début.
-- La carte est enregistrée dans Moneris (payment method MERCHANT_INITIATED);
-- on ne garde ici que l'identifiant Moneris et les 4 derniers chiffres.
--
-- Écriture : uniquement par les edge functions (service role).
-- Lecture : le closeur voit ses plans, admin et resp_vente voient tout.

CREATE TABLE IF NOT EXISTS public.payment_plans (
  id                        UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  closer_id                 UUID NOT NULL REFERENCES public.profiles(id),
  closer_name               TEXT NOT NULL,
  client_first_name         TEXT NOT NULL,
  client_last_name          TEXT NOT NULL,
  client_email              TEXT NOT NULL,
  client_phone              TEXT,
  product_name              TEXT NOT NULL,
  total_amount_cents        INTEGER NOT NULL CHECK (total_amount_cents > 0),
  installments_count        INTEGER NOT NULL CHECK (installments_count BETWEEN 1 AND 52),
  frequency_days            INTEGER NOT NULL CHECK (frequency_days BETWEEN 1 AND 365),
  first_charge_date         DATE NOT NULL,
  -- pending_card : en attente de la carte | active : versements en cours
  -- completed : tout payé | canceled : annulé | card_failed : 1er paiement refusé
  status                    TEXT NOT NULL DEFAULT 'pending_card'
                            CHECK (status IN ('pending_card','active','completed','canceled','card_failed')),
  card_entry_mode           TEXT CHECK (card_entry_mode IN ('closer','client_link')),
  moneris_payment_method_id TEXT,
  moneris_issuer_id         TEXT,
  card_brand                TEXT,
  card_last4                TEXT,
  card_expiry               TEXT,
  notes                     TEXT,
  created_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at                TIMESTAMPTZ NOT NULL DEFAULT now(),
  canceled_at               TIMESTAMPTZ,
  canceled_by               UUID REFERENCES public.profiles(id)
);

CREATE TABLE IF NOT EXISTS public.payment_installments (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  plan_id             UUID NOT NULL REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  number              INTEGER NOT NULL,
  amount_cents        INTEGER NOT NULL CHECK (amount_cents > 0),
  due_date            DATE NOT NULL,
  -- scheduled | processing | paid | declined | canceled
  status              TEXT NOT NULL DEFAULT 'scheduled'
                      CHECK (status IN ('scheduled','processing','paid','declined','canceled')),
  attempts            INTEGER NOT NULL DEFAULT 0,
  last_attempt_at     TIMESTAMPTZ,
  next_retry_date     DATE,
  moneris_payment_id  TEXT,
  moneris_order_id    TEXT,
  error_message       TEXT,
  paid_at             TIMESTAMPTZ,
  -- Envoi à Make (reçu QuickBooks) : pending | sent | failed
  receipt_status      TEXT NOT NULL DEFAULT 'pending'
                      CHECK (receipt_status IN ('pending','sent','failed')),
  created_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (plan_id, number)
);

CREATE INDEX IF NOT EXISTS payment_plans_closer_idx ON public.payment_plans(closer_id);
CREATE INDEX IF NOT EXISTS payment_installments_due_idx
  ON public.payment_installments(status, due_date);

ALTER TABLE public.payment_plans        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_installments ENABLE ROW LEVEL SECURITY;

-- Lecture seulement. Aucune policy INSERT/UPDATE/DELETE : tout passe
-- par les edge functions qui utilisent la service role.
DROP POLICY IF EXISTS "Terminal lit plans" ON public.payment_plans;
CREATE POLICY "Terminal lit plans" ON public.payment_plans
  FOR SELECT USING (
    closer_id = auth.uid()
    OR public.current_user_role() IN ('admin', 'resp_vente')
  );

DROP POLICY IF EXISTS "Terminal lit versements" ON public.payment_installments;
CREATE POLICY "Terminal lit versements" ON public.payment_installments
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.payment_plans p
      WHERE p.id = plan_id
        AND (p.closer_id = auth.uid() OR public.current_user_role() IN ('admin', 'resp_vente'))
    )
  );

-- Lien client : on ne garde que le hash du jeton. Table sans aucune
-- policy : illisible par l'API REST, seules les edge functions y accèdent.
CREATE TABLE IF NOT EXISTS public.payment_plan_links (
  plan_id     UUID PRIMARY KEY REFERENCES public.payment_plans(id) ON DELETE CASCADE,
  token_hash  TEXT NOT NULL UNIQUE,
  expires_at  TIMESTAMPTZ NOT NULL,
  used_at     TIMESTAMPTZ,
  attempts    INTEGER NOT NULL DEFAULT 0,  -- max 5 essais de carte par lien (anti-fraude)
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.payment_plan_links ENABLE ROW LEVEL SECURITY;

-- Prélèvement des versements dus : chaque jour à 10 h (heure de Montréal = 14 h UTC).
-- La fonction exige l'en-tête x-cron-secret (secret MONERIS_CRON_SECRET).
-- À activer SEULEMENT après les tests sandbox, en remplaçant <MONERIS_CRON_SECRET> :
--
-- SELECT cron.schedule(
--   'moneris-charge-due',
--   '0 14 * * *',
--   $$
--     SELECT net.http_post(
--       url     := 'https://cbqwrmyctsfdqmenczhm.supabase.co/functions/v1/moneris-charge-due',
--       body    := '{}'::jsonb,
--       headers := '{"Content-Type":"application/json","x-cron-secret":"<MONERIS_CRON_SECRET>"}'::jsonb
--     );
--   $$
-- );
