-- ID client Moneris = nom du client ("Prénom Nom"), avec un "." ajouté à la fin
-- si un autre client porte déjà exactement ce nom.
ALTER TABLE public.payment_plans ADD COLUMN IF NOT EXISTS customer_reference TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS payment_plans_customer_reference_uniq
  ON public.payment_plans(customer_reference) WHERE customer_reference IS NOT NULL;
