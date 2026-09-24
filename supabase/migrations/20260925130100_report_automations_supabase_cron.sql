-- Um único job global: chama o executor de automações a cada 5 minutos.
-- URL e segredo vêm do Supabase Vault a cada execução (nenhum valor sensível aqui).
--
-- Pré-requisito (feito uma vez, fora deste arquivo, para o valor nunca ficar em texto aberto):
--   select vault.create_secret('<mesmo valor de CRON_SECRET na Vercel>', 'cron_secret');
--   select vault.create_secret('https://laos-relatorios.vercel.app', 'laos_production_url');
select cron.schedule(
  'laos-report-automations',
  '*/5 * * * *',
  $job$
  select net.http_post(
    url := (select decrypted_secret from vault.decrypted_secrets where name = 'laos_production_url') || '/api/cron/report-automations',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    body := '{"source":"supabase-cron"}'::jsonb,
    timeout_milliseconds := 55000
  );
  $job$
);
