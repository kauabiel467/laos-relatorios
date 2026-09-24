begin;

-- Foundation for report automations: what to send (automations) and a
-- write-once history of every time it ran (runs). Nothing here sends anything or
-- schedules anything yet; it only stores configuration and results.

-- Who may CHANGE automations. Reading is open to any team member
-- (private.agency_staff); creating, editing, pausing and deleting is limited to
-- owners and managers because an automation eventually messages a client.
create or replace function private.agency_manager(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select auth.uid() is not null and exists(
    select 1
    from public.agency_clients c
    join public.team_members m on m.team_id = c.team_id
    where c.id = cid and m.user_id = auth.uid() and m.role in ('owner', 'manager')
  )
$$;
revoke all on function private.agency_manager(uuid) from public, anon;
grant execute on function private.agency_manager(uuid) to authenticated;

-- Lets automations reference (document, project) as a pair, so an automation can
-- never point at a dashboard that belongs to a different project. id is already
-- the primary key, so this adds no restriction on existing rows.
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'agency_documents_id_client_key') then
    alter table public.agency_documents add constraint agency_documents_id_client_key unique (id, client_id);
  end if;
end $$;

create table public.agency_report_automations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.agency_clients(id),
  document_id uuid not null,
  name text not null check (length(btrim(name)) between 1 and 120),
  -- Groups automations created together (e.g. the two halves of a weekly routine).
  routine_key text check (routine_key is null or routine_key ~ '^[a-z][a-z0-9_]{1,39}$'),
  -- Same ids as lib/report-templates ("Copiar relatório"); the automation reuses that code.
  message_template text not null check (message_template in ('sales', 'messages', 'followers', 'traffic', 'overview')),
  period_preset text not null check (period_preset in ('monday_thursday', 'friday_sunday', 'monday_sunday')),
  comparison_enabled boolean not null default true,
  include_detailed_report boolean not null default false,
  frequency text not null default 'weekly' check (frequency in ('weekly')),
  run_weekday smallint not null check (run_weekday between 1 and 7),
  run_time time not null default '09:00',
  timezone text not null,
  channel text not null default 'whatsapp' check (channel in ('whatsapp')),
  -- Who receives it (display name, phone, group id...). Never credentials: those
  -- belong in a server-only table, and the constraint below rejects obvious ones.
  recipient jsonb not null default '{}'::jsonb check (
    jsonb_typeof(recipient) = 'object'
    and not (recipient ?| array[
      'token', 'access_token', 'refresh_token', 'secret', 'client_secret',
      'api_key', 'apikey', 'password', 'authorization', 'credentials'
    ])
  ),
  -- New automations start paused so nothing is sent before someone turns it on.
  status text not null default 'paused' check (status in ('active', 'paused')),
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  last_run_at timestamptz,
  next_run_at timestamptz,
  constraint agency_report_automations_document_fkey
    foreign key (document_id, client_id) references public.agency_documents(id, client_id) on delete restrict,
  constraint agency_report_automations_name_key unique (client_id, name),
  constraint agency_report_automations_id_client_key unique (id, client_id)
);

create index agency_report_automations_client_idx on public.agency_report_automations(client_id);
create index agency_report_automations_document_idx on public.agency_report_automations(document_id);
create index agency_report_automations_created_by_idx on public.agency_report_automations(created_by);
create index agency_report_automations_due_idx on public.agency_report_automations(next_run_at) where status = 'active';

create table public.agency_report_automation_runs (
  id uuid primary key default gen_random_uuid(),
  automation_id uuid not null,
  client_id uuid not null references public.agency_clients(id),
  -- 1 for the first try; a retry is a NEW row with attempt + 1, never an edit.
  attempt integer not null default 1 check (attempt >= 1),
  scheduled_for timestamptz not null,
  status text not null default 'scheduled' check (status in ('scheduled', 'running', 'sent', 'failed', 'skipped')),
  started_at timestamptz,
  finished_at timestamptz,
  -- Everything below describes exactly what this run covered. It is copied from
  -- the automation at run time, so later edits to the automation or to the
  -- dashboard never rewrite history.
  timezone text not null,
  period_preset text not null check (period_preset in ('monday_thursday', 'friday_sunday', 'monday_sunday')),
  period_since date not null,
  period_until date not null,
  compare_since date,
  compare_until date,
  message_template text not null check (message_template in ('sales', 'messages', 'followers', 'traffic', 'overview')),
  message_text text,
  error_code text check (error_code is null or length(error_code) <= 80),
  error_message text check (error_message is null or length(error_message) <= 1000),
  -- Provider's id for the sent message (not a secret).
  provider_message_id text,
  -- Frozen {title, config, data} of the detailed report, only when the automation
  -- asked for one. Deliberately NOT the dashboard's published_snapshot.
  report_snapshot jsonb,
  report_share_token uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint agency_report_automation_runs_automation_fkey
    foreign key (automation_id, client_id) references public.agency_report_automations(id, client_id) on delete restrict,
  constraint agency_report_automation_runs_period_order check (period_until >= period_since),
  constraint agency_report_automation_runs_compare_pair check ((compare_since is null) = (compare_until is null)),
  constraint agency_report_automation_runs_compare_order check (compare_since is null or compare_until >= compare_since),
  constraint agency_report_automation_runs_finished_order check (finished_at is null or started_at is null or finished_at >= started_at),
  constraint agency_report_automation_runs_failed_reason check (status <> 'failed' or error_message is not null),
  constraint agency_report_automation_runs_slot_key unique (automation_id, scheduled_for, attempt)
);

create index agency_report_automation_runs_client_idx on public.agency_report_automation_runs(client_id);
create index agency_report_automation_runs_history_idx on public.agency_report_automation_runs(automation_id, scheduled_for desc);

-- Automations: keep the rows honest.
create function private.validate_report_automation() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = new.timezone) then
    raise exception 'Fuso horário inválido: %', new.timezone;
  end if;
  if not exists (select 1 from public.agency_documents d where d.id = new.document_id and d.kind = 'dashboard') then
    raise exception 'A automação precisa estar ligada a um dashboard.';
  end if;
  if tg_op = 'UPDATE' then
    if new.client_id <> old.client_id or new.created_by is distinct from old.created_by then
      raise exception 'Não é permitido alterar a origem da automação.';
    end if;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger validate_report_automation before insert or update on public.agency_report_automations
for each row execute function private.validate_report_automation();

-- Runs: a finished run is history and must never change. While it is still in
-- flight only its outcome fields may move, and only forward.
create function private.protect_report_automation_run() returns trigger
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
     or new.message_template <> old.message_template or new.created_at <> old.created_at then
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
  end if;
  new.updated_at := now();
  return new;
end;
$$;
create trigger protect_report_automation_run before update on public.agency_report_automation_runs
for each row execute function private.protect_report_automation_run();

alter table public.agency_report_automations enable row level security;
alter table public.agency_report_automation_runs enable row level security;

revoke all on public.agency_report_automations from public, anon, authenticated;
revoke all on public.agency_report_automation_runs from public, anon, authenticated;

-- Automations: team members read; owners/managers write, and only the columns a
-- person legitimately edits (last_run_at, timestamps and ids are engine-owned).
grant select on public.agency_report_automations to authenticated;
grant insert (client_id, document_id, name, routine_key, message_template, period_preset, comparison_enabled,
              include_detailed_report, frequency, run_weekday, run_time, timezone, channel, recipient,
              status, created_by, next_run_at)
  on public.agency_report_automations to authenticated;
grant update (document_id, name, routine_key, message_template, period_preset, comparison_enabled,
              include_detailed_report, frequency, run_weekday, run_time, timezone, channel, recipient,
              status, next_run_at)
  on public.agency_report_automations to authenticated;
grant delete on public.agency_report_automations to authenticated;
grant all on public.agency_report_automations to service_role;

-- Runs: people can only read them. Every write comes from the backend (service
-- role), so history cannot be forged from the browser.
grant select on public.agency_report_automation_runs to authenticated;
grant all on public.agency_report_automation_runs to service_role;

create policy report_automations_read on public.agency_report_automations
  for select to authenticated using ((select private.agency_staff(client_id)));
create policy report_automations_insert on public.agency_report_automations
  for insert to authenticated
  with check ((select private.agency_manager(client_id)) and created_by = (select auth.uid()));
create policy report_automations_update on public.agency_report_automations
  for update to authenticated
  using ((select private.agency_manager(client_id)))
  with check ((select private.agency_manager(client_id)));
create policy report_automations_delete on public.agency_report_automations
  for delete to authenticated using ((select private.agency_manager(client_id)));

create policy report_automation_runs_read on public.agency_report_automation_runs
  for select to authenticated using ((select private.agency_staff(client_id)));

comment on table public.agency_report_automations is
  'Automações de relatório por projeto: o que enviar, quando e para quem. Não guarda credenciais de provedores.';
comment on table public.agency_report_automation_runs is
  'Histórico imutável de execuções das automações. Escrita somente pelo backend (service role).';
comment on column public.agency_report_automations.period_preset is
  'monday_thursday | friday_sunday | monday_sunday. Blocos operacionais exatos da semana, calculados em lib/automations/periods.ts.';
comment on column public.agency_report_automations.timezone is
  'Fuso usado para decidir a data e o dia da semana da execução (projeto > integração > America/Sao_Paulo).';
comment on column public.agency_report_automation_runs.report_snapshot is
  'Cópia congelada {title, config, data} do relatório detalhado desta execução. Independente do published_snapshot do dashboard.';

commit;
