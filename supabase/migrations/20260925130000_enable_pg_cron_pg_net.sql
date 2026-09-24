-- Extensões usadas pelo agendador das automações de relatório (Supabase Cron -> Vercel).
create extension if not exists pg_net with schema extensions;
create extension if not exists pg_cron;
