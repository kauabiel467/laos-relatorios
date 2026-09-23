begin;

-- OAuth credentials are intentionally kept in a server-only table. Values are
-- encrypted by the application before they reach Postgres; browser roles have
-- neither table privileges nor an RLS path to read the ciphertext.
create table public.agency_ifood_connections (
  client_id uuid primary key references public.agency_clients(id) on delete cascade,
  connection_status text not null default 'error'
    check (connection_status in ('connected', 'error')),
  access_token_ciphertext text,
  refresh_token_ciphertext text,
  token_expires_at timestamptz,
  connected_by uuid references auth.users(id) on delete set null,
  connected_at timestamptz,
  updated_at timestamptz not null default now(),
  last_error text check (last_error is null or length(last_error) <= 1000),
  constraint agency_ifood_connected_credentials_check check (
    connection_status <> 'connected'
    or (
      access_token_ciphertext is not null
      and refresh_token_ciphertext is not null
      and token_expires_at is not null
      and connected_at is not null
    )
  )
);

create index agency_ifood_connections_connected_by_idx
  on public.agency_ifood_connections(connected_by);
create index agency_ifood_connections_status_expiry_idx
  on public.agency_ifood_connections(connection_status, token_expires_at);

create function private.set_ifood_connection_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger agency_ifood_connections_updated_at
before update on public.agency_ifood_connections
for each row execute function private.set_ifood_connection_updated_at();

alter table public.agency_ifood_connections enable row level security;
revoke all on table public.agency_ifood_connections from public, anon, authenticated;
grant all on table public.agency_ifood_connections to service_role;

create policy ifood_connections_no_direct_access
on public.agency_ifood_connections
for all
to authenticated
using (false)
with check (false);

comment on table public.agency_ifood_connections is
  'Conexões OAuth iFood por projeto. Acesso exclusivo do backend com service role.';
comment on column public.agency_ifood_connections.access_token_ciphertext is
  'Access token cifrado com AES-256-GCM antes da persistência.';
comment on column public.agency_ifood_connections.refresh_token_ciphertext is
  'Refresh token cifrado com AES-256-GCM antes da persistência.';

commit;
