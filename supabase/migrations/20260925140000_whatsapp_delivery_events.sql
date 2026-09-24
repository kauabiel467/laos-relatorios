begin;

-- Delivery status reported by WhatsApp AFTER a message was accepted (sent ->
-- delivered -> read, or failed with a reason). A run is immutable once it
-- finishes, so these arrive as separate append-only events tied to the run.
-- Only the backend (service role) writes them; team members can read them.

create table public.agency_report_automation_delivery_events (
  id uuid primary key default gen_random_uuid(),
  run_id uuid not null references public.agency_report_automation_runs(id) on delete restrict,
  client_id uuid not null references public.agency_clients(id),
  -- The provider's id for the message (the run's provider_message_id). Not a secret.
  provider_message_id text not null check (length(provider_message_id) between 1 and 200),
  status text not null check (status in ('sent', 'delivered', 'read', 'failed')),
  occurred_at timestamptz not null,
  error_code text check (error_code is null or length(error_code) <= 40),
  error_message text check (error_message is null or length(error_message) <= 500),
  created_at timestamptz not null default now(),
  -- The provider redelivers webhooks; the same status for the same message is stored once.
  constraint agency_report_automation_delivery_events_message_status_key unique (provider_message_id, status)
);

create index agency_report_automation_delivery_events_run_idx on public.agency_report_automation_delivery_events(run_id);
create index agency_report_automation_delivery_events_client_idx on public.agency_report_automation_delivery_events(client_id);
-- Lets a webhook find its run by the provider's message id.
create index agency_report_automation_runs_provider_message_idx
  on public.agency_report_automation_runs(provider_message_id) where provider_message_id is not null;

alter table public.agency_report_automation_delivery_events enable row level security;
revoke all on public.agency_report_automation_delivery_events from public, anon, authenticated;
grant select on public.agency_report_automation_delivery_events to authenticated;
grant all on public.agency_report_automation_delivery_events to service_role;

create policy report_automation_delivery_events_read on public.agency_report_automation_delivery_events
  for select to authenticated using ((select private.agency_staff(client_id)));

comment on table public.agency_report_automation_delivery_events is
  'Status de entrega do WhatsApp (enviado, entregue, lido, falhou) recebido por webhook depois do envio. Somente acréscimo; escrita pelo backend.';

commit;
