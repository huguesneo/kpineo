-- ============================================================
-- Migration 021 — Système de récompenses (boutique)
-- Tables : rewards_catalog, redemptions
-- Realtime activé sur redemptions
-- Seed : 11 récompenses de démarrage
-- ============================================================

-- ─── TABLE : rewards_catalog ─────────────────────────────────
CREATE TABLE IF NOT EXISTS public.rewards_catalog (
  id               UUID      PRIMARY KEY DEFAULT uuid_generate_v4(),
  title            TEXT      NOT NULL,
  description      TEXT,
  cost_points      INTEGER   NOT NULL CHECK (cost_points > 0),
  category         TEXT      NOT NULL CHECK (category IN ('cadeau', 'monetaire', 'experience', 'temps_off')),
  icon_url         TEXT,                              -- emoji ou URL image
  is_active        BOOLEAN   NOT NULL DEFAULT true,
  stock_remaining  INTEGER,                           -- NULL = illimité
  expiration_days  INTEGER,                           -- NULL = pas d'expiration après échange
  sort_order       INTEGER   NOT NULL DEFAULT 0,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS rewards_catalog_active_sort_idx
  ON public.rewards_catalog (is_active, sort_order);

-- ─── TABLE : redemptions ─────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.redemptions (
  id           UUID        PRIMARY KEY DEFAULT uuid_generate_v4(),
  user_id      UUID        NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  reward_id    UUID        NOT NULL REFERENCES public.rewards_catalog(id),
  points_spent INTEGER     NOT NULL,
  status       TEXT        NOT NULL DEFAULT 'pending'
                 CHECK (status IN ('pending', 'available', 'used', 'cancelled', 'expired')),
  redeemed_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  validated_at TIMESTAMPTZ,   -- quand admin passe en 'available'
  used_at      TIMESTAMPTZ,   -- quand membre utilise
  expires_at   TIMESTAMPTZ,   -- calculé depuis expiration_days au moment de la validation
  admin_notes  TEXT
);

CREATE INDEX IF NOT EXISTS redemptions_user_status_idx
  ON public.redemptions (user_id, status, redeemed_at DESC);

CREATE INDEX IF NOT EXISTS redemptions_status_idx
  ON public.redemptions (status, redeemed_at DESC);  -- pour la vue admin

-- ─── RLS : rewards_catalog ───────────────────────────────────
ALTER TABLE public.rewards_catalog ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total rewards_catalog" ON public.rewards_catalog
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- Membres : lecture du catalogue actif uniquement
CREATE POLICY "Membres lisent le catalogue actif" ON public.rewards_catalog
  FOR SELECT
  USING (is_active = true);

-- ─── RLS : redemptions ───────────────────────────────────────
ALTER TABLE public.redemptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admin accès total redemptions" ON public.redemptions
  FOR ALL
  USING (EXISTS (
    SELECT 1 FROM public.profiles p
    WHERE p.id = auth.uid() AND p.role = 'admin'
  ));

-- Membres : lecture de leurs propres redemptions
CREATE POLICY "Membres lisent leurs propres redemptions" ON public.redemptions
  FOR SELECT
  USING (user_id = auth.uid());

-- Membres : création de leurs propres redemptions
-- (la déduction de points est gérée côté client via RPC)
CREATE POLICY "Membres créent leurs propres redemptions" ON public.redemptions
  FOR INSERT
  WITH CHECK (user_id = auth.uid());

-- Membres : peuvent marquer 'used' leurs propres redemptions 'available'
-- (UPDATE limité au champ status, vérifié par le trigger ci-dessous)
CREATE POLICY "Membres marquent leurs redemptions utilisées" ON public.redemptions
  FOR UPDATE
  USING (user_id = auth.uid() AND status = 'available')
  WITH CHECK (user_id = auth.uid() AND status = 'used');

-- ─── REALTIME ────────────────────────────────────────────────
ALTER TABLE public.redemptions REPLICA IDENTITY FULL;

ALTER PUBLICATION supabase_realtime ADD TABLE public.redemptions;

-- ─── SEED : récompenses de démarrage ─────────────────────────
INSERT INTO public.rewards_catalog
  (title, description, cost_points, category, icon_url, sort_order)
VALUES
  -- Temps off
  ('Vendredi PM off',
   'Quitte le bureau à midi le vendredi — à planifier avec Hugues.',
   30, 'temps_off', '🌅', 10),

  ('Demi-journée de congé',
   'Une demi-journée de congé payée à utiliser quand tu veux (avec préavis).',
   50, 'temps_off', '☀️', 20),

  ('Journée de congé payée',
   'Une journée complète de congé payée — méritée !',
   100, 'temps_off', '🏖️', 30),

  -- Cadeaux
  ('Carte-cadeau Amazon 25 $',
   'Code Amazon de 25 $ envoyé par email.',
   60, 'cadeau', '📦', 40),

  ('Produit NEO offert',
   'Un produit NEO Performance de ton choix parmi le catalogue.',
   80, 'cadeau', '🌿', 50),

  ('Carte-cadeau resto 50 $',
   'Carte-cadeau restaurant de ton choix — 50 $.',
   120, 'cadeau', '🍽️', 60),

  -- Expériences
  ('Formation au choix',
   'Un livre + un cours en ligne sur un sujet qui t''inspire.',
   100, 'experience', '📚', 70),

  ('Massage 60 min',
   'Massage professionnel de 60 minutes — tu le mérites.',
   150, 'experience', '💆', 80),

  ('Souper équipe',
   'Souper d''équipe payé par NEO — à organiser ensemble.',
   200, 'experience', '🥂', 90),

  -- Monétaire
  ('Bonus 50 $ sur paie',
   'Bonus de 50 $ ajouté à ta prochaine paie.',
   100, 'monetaire', '💵', 100),

  ('Bonus 150 $ sur paie',
   'Bonus de 150 $ ajouté à ta prochaine paie.',
   280, 'monetaire', '💰', 110);
