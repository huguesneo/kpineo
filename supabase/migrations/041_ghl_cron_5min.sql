-- Passer le cron GHL de 30 minutes à 5 minutes
SELECT cron.unschedule('ghl-incremental-sync');

SELECT cron.schedule(
  'ghl-incremental-sync',
  '*/5 * * * *',
  'SELECT public.trigger_ghl_incremental_sync()'
);
