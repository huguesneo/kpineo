-- Campagnes Meta Ads
CREATE TABLE IF NOT EXISTS meta_campaigns (
  id               BIGSERIAL PRIMARY KEY,
  meta_id          TEXT UNIQUE NOT NULL,
  name             TEXT NOT NULL,
  status           TEXT,
  objective        TEXT,
  daily_budget     NUMERIC,
  lifetime_budget  NUMERIC,
  budget_remaining NUMERIC,
  start_time       TIMESTAMPTZ,
  stop_time        TIMESTAMPTZ,
  created_time     TIMESTAMPTZ,
  synced_at        TIMESTAMPTZ DEFAULT now()
);

-- Ads Meta (avec insights 30 derniers jours)
CREATE TABLE IF NOT EXISTS meta_ads (
  id             BIGSERIAL PRIMARY KEY,
  meta_id        TEXT UNIQUE NOT NULL,
  name           TEXT NOT NULL,
  status         TEXT,
  campaign_id    TEXT,
  adset_id       TEXT,
  adset_name     TEXT,
  adset_budget   NUMERIC,
  thumbnail_url  TEXT,
  ad_title       TEXT,
  ad_body        TEXT,
  impressions    INTEGER DEFAULT 0,
  clicks         INTEGER DEFAULT 0,
  spend          NUMERIC DEFAULT 0,
  cpm            NUMERIC DEFAULT 0,
  cpc            NUMERIC DEFAULT 0,
  ctr            NUMERIC DEFAULT 0,
  leads          INTEGER DEFAULT 0,
  purchases      INTEGER DEFAULT 0,
  purchase_value NUMERIC DEFAULT 0,
  synced_at      TIMESTAMPTZ DEFAULT now()
);

-- Index pour jointure campagne ↔ ads
CREATE INDEX IF NOT EXISTS meta_ads_campaign_id_idx ON meta_ads(campaign_id);

-- RLS : lecture pour tous les users authentifiés
ALTER TABLE meta_campaigns ENABLE ROW LEVEL SECURITY;
ALTER TABLE meta_ads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "read meta_campaigns" ON meta_campaigns FOR SELECT TO authenticated USING (true);
CREATE POLICY "read meta_ads"       ON meta_ads       FOR SELECT TO authenticated USING (true);

-- Cron toutes les heures
SELECT cron.schedule(
  'meta-ads-hourly-sync',
  '0 * * * *',
  $$
    SELECT net.http_post(
      url    := (SELECT value FROM vault.decrypted_secrets WHERE name = 'supabase_url') || '/functions/v1/meta-ads-sync',
      body   := '{"action":"sync_all"}'::jsonb,
      headers := jsonb_build_object(
        'Content-Type',  'application/json',
        'Authorization', 'Bearer ' || (SELECT value FROM vault.decrypted_secrets WHERE name = 'supabase_anon_key')
      )
    )
  $$
);
