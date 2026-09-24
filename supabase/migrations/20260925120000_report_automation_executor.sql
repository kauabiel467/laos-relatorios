begin;

-- Executor support for report automations. Purely additive: new nullable/defaulted
-- columns on the (write-once) run history, the same immutability rules extended to
-- them, and a public function that serves ONE run's frozen report by its own token.

alter table public.agency_report_automation_runs
  -- What started the run. 'test' runs go to a number typed by the person, never
  -- change the schedule and never touch last_run_at.
  add column trigger_type text not null default 'scheduled' check (trigger_type in ('scheduled', 'manual', 'test')),
  -- A retry is a new row pointing at the attempt it retries.
  add column parent_run_id uuid,
  add column requested_by uuid references auth.users(id) on delete set null,
  -- One key per intended send: two workers, a repeated cron call or a double click
  -- collide on it and the second one does nothing.
  add column idempotency_key text,
  -- Masked recipient (never the full number) for the history screen.
  add column recipient_label text check (recipient_label is null or length(recipient_label) <= 80),
  add column provider text check (provider is null or length(provider) <= 40),
  add column provider_status text check (provider_status is null or length(provider_status) <= 120),
  -- Failure was transient (timeout, 429, 5xx) and an automatic retry is allowed
  -- once retry_after has passed. Permanent failures stay false and never loop.
  add column retryable boolean not null default false,
  add column retry_after timestamptz;

alter table public.agency_report_automation_runs
  add constraint agency_report_automation_runs_id_automation_key unique (id, automation_id),
  add constraint agency_report_automation_runs_parent_fkey
    foreign key (parent_run_id, automation_id)
    references public.agency_report_automation_runs (id, automation_id) on delete restrict,
  add constraint agency_report_automation_runs_retry_only_failed check (not retryable or status = 'failed');

create unique index agency_report_automation_runs_idempotency_key
  on public.agency_report_automation_runs (idempotency_key) where idempotency_key is not null;
create index agency_report_automation_runs_parent_idx on public.agency_report_automation_runs (parent_run_id);
create index agency_report_automation_runs_requested_by_idx on public.agency_report_automation_runs (requested_by);
create index agency_report_automation_runs_retry_idx
  on public.agency_report_automation_runs (retry_after) where status = 'failed' and retryable;
create index agency_report_automation_runs_open_idx
  on public.agency_report_automation_runs (created_at) where status in ('scheduled', 'running');

-- Same protection as before, now covering the new identity columns: what a run IS
-- (trigger, parent, requester, key, recipient) is fixed at creation.
create or replace function private.protect_report_automation_run() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  rank_old int := case old.status when 'scheduled' then 0 when 'running' then 1 else 2 end;
  rank_new int := case new.status when 'scheduled' then 0 when 'running' then 1 else 2 end;
begin
  if new.automation_id <> old.automation_id or new.client_id <> old.client_id
     or new.attempt <> old.attempt or new.scheduled_for <> old.scheduled_for
     or new.timezone <> old.timezone or new.period_preset <> old.period_preset
     or new.period_since <> old.period_since or new.period_until <> old.period_until
     or new.compare_since is distinct from old.compare_since or new.compare_until is distinct from old.compare_until
     or new.message_template <> old.message_template or new.created_at <> old.created_at
     or new.trigger_type <> old.trigger_type or new.parent_run_id is distinct from old.parent_run_id
     or new.requested_by is distinct from old.requested_by or new.idempotency_key is distinct from old.idempotency_key
     or new.recipient_label is distinct from old.recipient_label then
    raise exception 'O período e a origem de uma execução não podem ser alterados.';
  end if;
  if old.status in ('sent', 'failed', 'skipped') then
    -- The only change a finished run accepts is switching its public report link off.
    if (to_jsonb(new) - 'report_share_token' - 'updated_at') is distinct from (to_jsonb(old) - 'report_share_token' - 'updated_at')
       or (new.report_share_token is distinct from old.report_share_token and new.report_share_token is not null) then
      raise exception 'Execuções finalizadas são imutáveis.';
    end if;
  else
    if rank_new < rank_old then
      raise exception 'Uma execução não pode voltar a um estado anterior.';
    end if;
    if old.report_snapshot is not null and new.report_snapshot is distinct from old.report_snapshot then
      raise exception 'O snapshot da execução não pode ser reescrito.';
    end if;
    if old.report_share_token is not null and new.report_share_token is distinct from old.report_share_token then
      raise exception 'O link do relatório da execução não pode ser reescrito.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;

-- The frozen report of ONE automation run, looked up by that run's own token.
-- It reads only report_snapshot, never the dashboard's published_snapshot, so
-- editing or republishing the dashboard cannot change what an old link shows.
-- Returns the same shape as get_public_dashboard, so the same page renders it.
-- A wrong token and a revoked link (token set to null) both return no row.
create or replace function public.get_public_automation_report(p_token uuid)
returns table (
  title text,
  config jsonb,
  data jsonb,
  updated_at timestamptz,
  client_name text,
  client_logo_url text
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    r.report_snapshot ->> 'title',
    r.report_snapshot -> 'config',
    r.report_snapshot -> 'data',
    coalesce(r.started_at, r.created_at),
    c.name,
    c.logo_url
  from public.agency_report_automation_runs r
  join public.agency_clients c on c.id = r.client_id
  where r.report_share_token = p_token
    and r.report_snapshot is not null
$$;

revoke all on function public.get_public_automation_report(uuid) from public, anon, authenticated;
grant execute on function public.get_public_automation_report(uuid) to anon;

comment on column public.agency_report_automation_runs.trigger_type is
  'scheduled (agendador), manual (Executar agora) ou test (Enviar teste para um número informado).';
comment on column public.agency_report_automation_runs.parent_run_id is
  'Tentativa anterior que esta execução repete (mesmo período, mesma automação).';
comment on column public.agency_report_automation_runs.idempotency_key is
  'Chave única do envio pretendido: impede envio duplicado por chamadas repetidas, concorrência ou reentrega.';
comment on column public.agency_report_automation_runs.retryable is
  'Falha transitória (timeout, 429, 5xx) elegível a nova tentativa automática após retry_after.';
comment on function public.get_public_automation_report(uuid) is
  'Relatório congelado de UMA execução, pelo token próprio dela. Nunca lê published_snapshot do dashboard.';

commit;
