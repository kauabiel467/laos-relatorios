begin;

-- Project presentation preferences and resumable onboarding. Existing projects
-- are treated as already configured; newly-created projects explicitly start
-- at step 2 in the application after their details are persisted.
alter table public.agency_clients
  add column if not exists language text not null default 'pt-BR',
  add column if not exists currency text not null default 'BRL',
  add column if not exists date_format text not null default 'DD/MM/YYYY',
  add column if not exists decimal_separator text not null default ',',
  add column if not exists thousands_separator text not null default '.',
  add column if not exists timezone text not null default 'America/Sao_Paulo',
  add column if not exists onboarding_step smallint not null default 4,
  add column if not exists onboarding_completed_at timestamptz default now();

-- The temporary default backfills only rows that predate this migration.
-- New projects explicitly insert NULL until the four-step flow is completed.
alter table public.agency_clients
  alter column onboarding_completed_at drop default;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_clients_language_check'
      and conrelid = 'public.agency_clients'::regclass
  ) then
    alter table public.agency_clients add constraint agency_clients_language_check
      check (language in ('pt-BR', 'en-US', 'es-ES'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_clients_currency_check'
      and conrelid = 'public.agency_clients'::regclass
  ) then
    alter table public.agency_clients add constraint agency_clients_currency_check
      check (currency in ('BRL', 'USD', 'EUR', 'ARS', 'MXN'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_clients_date_format_check'
      and conrelid = 'public.agency_clients'::regclass
  ) then
    alter table public.agency_clients add constraint agency_clients_date_format_check
      check (date_format in ('DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_clients_number_separators_check'
      and conrelid = 'public.agency_clients'::regclass
  ) then
    alter table public.agency_clients add constraint agency_clients_number_separators_check
      check (
        decimal_separator in ('.', ',')
        and thousands_separator in ('.', ',')
        and decimal_separator <> thousands_separator
      );
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_clients_timezone_check'
      and conrelid = 'public.agency_clients'::regclass
  ) then
    alter table public.agency_clients add constraint agency_clients_timezone_check
      check (timezone in (
        'America/Sao_Paulo', 'America/Fortaleza', 'America/Recife',
        'America/Bahia', 'America/Belem', 'America/Manaus',
        'America/Cuiaba', 'America/Porto_Velho', 'America/Boa_Vista',
        'America/Rio_Branco', 'America/Noronha',
        'America/Argentina/Buenos_Aires', 'America/Bogota',
        'America/Lima', 'America/Santiago', 'America/Mexico_City',
        'America/New_York', 'Europe/Lisbon', 'Europe/Madrid',
        'Europe/London', 'UTC'
      ));
  end if;
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_clients_onboarding_step_check'
      and conrelid = 'public.agency_clients'::regclass
  ) then
    alter table public.agency_clients add constraint agency_clients_onboarding_step_check
      check (onboarding_step between 1 and 4);
  end if;
end $$;

-- External client access has one real capability in this release: viewing
-- shared/published material. Keep that explicit instead of exposing roles that
-- would have identical permissions.
alter table public.agency_client_access
  add column if not exists email text,
  add column if not exists role text not null default 'viewer',
  add column if not exists created_at timestamptz not null default now(),
  add column if not exists granted_by uuid references auth.users(id) on delete set null;

update public.agency_client_access access
set email = lower(users.email)
from auth.users users
where access.user_id = users.id
  and access.email is null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_client_access_role_check'
      and conrelid = 'public.agency_client_access'::regclass
  ) then
    alter table public.agency_client_access add constraint agency_client_access_role_check
      check (role = 'viewer');
  end if;
end $$;

create index if not exists agency_client_access_granted_by_idx
  on public.agency_client_access(granted_by);

create table if not exists public.agency_client_invitations (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references public.agency_clients(id) on delete cascade,
  email text not null,
  role text not null default 'viewer' check (role = 'viewer'),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz
);

create unique index if not exists agency_client_invitations_pending_email_idx
  on public.agency_client_invitations(client_id, lower(email))
  where status = 'pending';
create index if not exists agency_client_invitations_pending_lookup_idx
  on public.agency_client_invitations(lower(email))
  where status = 'pending';
create index if not exists agency_client_invitations_client_status_idx
  on public.agency_client_invitations(client_id, status, created_at desc);
create index if not exists agency_client_invitations_invited_by_idx
  on public.agency_client_invitations(invited_by);
create index if not exists agency_client_invitations_accepted_by_idx
  on public.agency_client_invitations(accepted_by);

alter table public.agency_client_invitations enable row level security;
revoke all on public.agency_client_invitations from public, anon, authenticated;
grant select on public.agency_client_invitations to authenticated;
grant all on public.agency_client_invitations to service_role;

drop policy if exists client_invitations_read on public.agency_client_invitations;
create policy client_invitations_read
on public.agency_client_invitations
for select
to authenticated
using ((select private.agency_staff(client_id)));

-- A project invitation is persisted even when the target does not yet have an
-- account. When a confirmed account already exists, access is effective at once.
drop function if exists public.agency_grant_access(uuid, text);
create function public.agency_grant_access(cid uuid, target_email text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  normalized_email text := lower(trim(target_email));
  target_id uuid;
begin
  if actor is null or not exists (
    select 1
    from public.agency_clients client
    join public.team_members member on member.team_id = client.team_id
    where client.id = cid
      and member.user_id = actor
      and member.role in ('owner', 'manager')
  ) then
    raise exception 'Sem permissão para gerenciar acessos';
  end if;
  if normalized_email is null
    or length(normalized_email) > 320
    or normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$' then
    raise exception 'E-mail inválido';
  end if;

  select id into target_id
  from auth.users
  where lower(email) = normalized_email
    and email_confirmed_at is not null
  limit 1;

  if target_id is not null then
    insert into public.agency_client_access(
      client_id, user_id, email, role, granted_by
    ) values (
      cid, target_id, normalized_email, 'viewer', actor
    )
    on conflict (client_id, user_id) do update
      set email = excluded.email,
          role = excluded.role,
          granted_by = excluded.granted_by;

    update public.agency_client_invitations
    set status = 'accepted',
        accepted_by = target_id,
        accepted_at = now()
    where client_id = cid
      and lower(email) = normalized_email
      and status = 'pending';
    return 'accepted';
  end if;

  insert into public.agency_client_invitations(
    client_id, email, role, status, invited_by
  ) values (
    cid, normalized_email, 'viewer', 'pending', actor
  ) on conflict do nothing;

  update public.agency_client_invitations
  set invited_by = actor,
      created_at = now()
  where client_id = cid
    and lower(email) = normalized_email
    and status = 'pending';
  return 'pending';
end $$;

revoke all on function public.agency_grant_access(uuid, text) from public, anon;
grant execute on function public.agency_grant_access(uuid, text) to authenticated;

create or replace function public.agency_accept_client_invitations()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  actor_email text;
  accepted_count integer := 0;
begin
  if actor is null then
    raise exception 'Autenticação necessária';
  end if;
  select lower(email) into actor_email
  from auth.users
  where id = actor
    and email_confirmed_at is not null;
  if actor_email is null then
    return 0;
  end if;

  insert into public.agency_client_access(
    client_id, user_id, email, role, granted_by
  )
  select invitation.client_id, actor, actor_email, 'viewer', invitation.invited_by
  from public.agency_client_invitations invitation
  where lower(invitation.email) = actor_email
    and invitation.status = 'pending'
  on conflict (client_id, user_id) do update
    set email = excluded.email,
        role = excluded.role;

  update public.agency_client_invitations
  set status = 'accepted',
      accepted_by = actor,
      accepted_at = now()
  where lower(email) = actor_email
    and status = 'pending';
  get diagnostics accepted_count = row_count;
  return accepted_count;
end $$;

revoke all on function public.agency_accept_client_invitations() from public, anon;
grant execute on function public.agency_accept_client_invitations() to authenticated;

create or replace function public.agency_revoke_access(cid uuid, target_user uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
    from public.agency_clients client
    join public.team_members member on member.team_id = client.team_id
    where client.id = cid
      and member.user_id = actor
      and member.role in ('owner', 'manager')
  ) then
    raise exception 'Sem permissão para gerenciar acessos';
  end if;
  delete from public.agency_client_access
  where client_id = cid and user_id = target_user;
end $$;

revoke all on function public.agency_revoke_access(uuid, uuid) from public, anon;
grant execute on function public.agency_revoke_access(uuid, uuid) to authenticated;

create or replace function public.agency_revoke_invitation(cid uuid, invitation_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
    from public.agency_clients client
    join public.team_members member on member.team_id = client.team_id
    where client.id = cid
      and member.user_id = actor
      and member.role in ('owner', 'manager')
  ) then
    raise exception 'Sem permissão para gerenciar acessos';
  end if;
  update public.agency_client_invitations
  set status = 'revoked'
  where id = invitation_id and client_id = cid and status = 'pending';
end $$;

revoke all on function public.agency_revoke_invitation(uuid, uuid) from public, anon;
grant execute on function public.agency_revoke_invitation(uuid, uuid) to authenticated;

-- Sanitized connection health stays beside the server-only project/session
-- mapping. Access tokens and session identifiers remain inaccessible to clients.
alter table public.agency_meta_connections
  add column if not exists account_name text,
  add column if not exists account_currency text,
  add column if not exists account_timezone text,
  add column if not exists account_status text,
  add column if not exists connection_status text not null default 'untested',
  add column if not exists last_checked_at timestamptz,
  add column if not exists last_success_at timestamptz,
  add column if not exists last_error_category text,
  add column if not exists last_error_message text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'agency_meta_connections_status_check'
      and conrelid = 'public.agency_meta_connections'::regclass
  ) then
    alter table public.agency_meta_connections add constraint agency_meta_connections_status_check
      check (connection_status in (
        'untested', 'connected', 'reauth_required',
        'temporarily_unavailable', 'error'
      ));
  end if;
end $$;

with connection_metadata as (
  select
    connection.client_id,
    connection.account_id,
    account_data.item
  from public.agency_meta_connections connection
  join public.meta_integration_sessions session
    on session.id = connection.session_id
  left join lateral (
    select item
    from jsonb_array_elements(coalesce(session.accounts, '[]'::jsonb)) item
    where item ->> 'id' = connection.account_id
    limit 1
  ) account_data on true
)
update public.agency_meta_connections connection
set account_name = coalesce(metadata.item ->> 'name', metadata.account_id),
    account_currency = metadata.item ->> 'currency',
    account_timezone = metadata.item ->> 'timezoneName',
    account_status = metadata.item ->> 'status',
    connection_status = 'untested'
from connection_metadata metadata
where connection.client_id = metadata.client_id;

-- Binding and unlinking update both the protected mapping and the project row
-- in one database transaction.
drop function if exists public.agency_bind_meta_connection(
  uuid, uuid, text, text, text, text, text, timestamptz
);
create or replace function public.agency_bind_meta_connection(
  cid uuid,
  target_session_id uuid,
  target_account_id text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor uuid := auth.uid();
  account_metadata jsonb;
begin
  if actor is null or not exists (
    select 1
    from public.agency_clients client
    join public.team_members member on member.team_id = client.team_id
    where client.id = cid and member.user_id = actor
  ) then
    raise exception 'Sem permissão para conectar integrações';
  end if;
  select account into account_metadata
    from public.meta_integration_sessions session,
         lateral jsonb_array_elements(coalesce(session.accounts, '[]'::jsonb)) account
    where session.id = target_session_id
      and session.user_id = actor
      and session.stage = 'connected'
      and account ->> 'id' = target_account_id
    limit 1;
  if account_metadata is null then
    raise exception 'A conta não pertence à autorização Meta atual';
  end if;

  insert into public.agency_meta_connections(
    client_id, session_id, account_id, connected_by, connected_at,
    account_name, account_currency, account_timezone, account_status,
    connection_status, last_checked_at, last_success_at,
    last_error_category, last_error_message
  ) values (
    cid, target_session_id, target_account_id, actor, now(),
    coalesce(account_metadata ->> 'name', target_account_id),
    account_metadata ->> 'currency',
    account_metadata ->> 'timezoneName',
    account_metadata ->> 'status',
    'untested', null, null, null, null
  )
  on conflict (client_id) do update set
    session_id = excluded.session_id,
    account_id = excluded.account_id,
    connected_by = excluded.connected_by,
    connected_at = excluded.connected_at,
    account_name = excluded.account_name,
    account_currency = excluded.account_currency,
    account_timezone = excluded.account_timezone,
    account_status = excluded.account_status,
    connection_status = 'untested',
    last_checked_at = null,
    last_success_at = null,
    last_error_category = null,
    last_error_message = null;

  update public.agency_clients
  set meta_account_id = target_account_id,
      meta_connected_at = now(),
      onboarding_step = greatest(onboarding_step, 4)
  where id = cid;
end $$;

revoke all on function public.agency_bind_meta_connection(
  uuid, uuid, text
) from public, anon;
grant execute on function public.agency_bind_meta_connection(
  uuid, uuid, text
) to authenticated;

create or replace function public.agency_unlink_meta_connection(cid uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare actor uuid := auth.uid();
begin
  if actor is null or not exists (
    select 1
    from public.agency_clients client
    join public.team_members member on member.team_id = client.team_id
    where client.id = cid
      and member.user_id = actor
      and member.role in ('owner', 'manager')
  ) then
    raise exception 'Sem permissão para remover integrações';
  end if;
  delete from public.agency_meta_connections where client_id = cid;
  update public.agency_clients
  set meta_account_id = null,
      meta_connected_at = null,
      onboarding_completed_at = null,
      onboarding_step = least(onboarding_step, 3)
  where id = cid;
end $$;

revoke all on function public.agency_unlink_meta_connection(uuid) from public, anon;
grant execute on function public.agency_unlink_meta_connection(uuid) to authenticated;

comment on table public.agency_client_invitations is
  'Convites de visualização por projeto; aceitos após cadastro e confirmação do e-mail.';
comment on column public.agency_meta_connections.connection_status is
  'Saúde sanitizada da conexão. Tokens permanecem apenas em meta_integration_sessions.';

commit;
