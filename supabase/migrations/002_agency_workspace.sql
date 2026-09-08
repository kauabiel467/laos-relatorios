begin;
create schema if not exists private;
create table public.agency_clients (
 id uuid primary key default gen_random_uuid(),
 team_id uuid not null references public.teams(id),
 name text not null check(length(name) between 2 and 120),
 segment text not null default 'Restaurante / Delivery',
 unit text not null default 'Unidade principal',
 contact_email text,
 meta_account_id text,
 status text not null default 'active' check(status in ('active','paused')),
 created_at timestamptz not null default now()
);
create index agency_clients_team_idx on public.agency_clients(team_id);
create table public.agency_client_access (
 client_id uuid not null references public.agency_clients(id) on delete cascade,
 user_id uuid not null references auth.users(id) on delete cascade,
 primary key(client_id,user_id)
);
create index agency_access_user_idx on public.agency_client_access(user_id);
create table public.agency_records (
 id uuid primary key default gen_random_uuid(),
 client_id uuid not null references public.agency_clients(id) on delete cascade,
 kind text not null check(kind in ('goal','timeline','report','snapshot','automation')),
 title text not null check(length(title) between 1 and 180),
 payload jsonb not null default '{}',
 visibility text not null default 'internal' check(visibility in ('internal','shared')),
 status text not null default 'active' check(status in ('active','draft','published','paused','resolved')),
 created_by uuid references auth.users(id),
 created_at timestamptz not null default now()
);
create index agency_records_client_kind_idx on public.agency_records(client_id,kind,created_at desc);
create or replace function private.agency_staff(cid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select auth.uid() is not null and exists(select 1 from public.agency_clients c join public.team_members m on m.team_id=c.team_id where c.id=cid and m.user_id=auth.uid())
$$;
create or replace function private.agency_view(cid uuid) returns boolean
language sql stable security definer set search_path='' as $$
 select private.agency_staff(cid) or (auth.uid() is not null and exists(select 1 from public.agency_client_access a where a.client_id=cid and a.user_id=auth.uid()))
$$;
revoke all on function private.agency_staff(uuid),private.agency_view(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.agency_staff(uuid),private.agency_view(uuid) to authenticated;
alter table public.agency_clients enable row level security;
alter table public.agency_client_access enable row level security;
alter table public.agency_records enable row level security;
revoke all on public.agency_clients,public.agency_client_access,public.agency_records from anon,authenticated;
grant select,insert,update on public.agency_clients,public.agency_records to authenticated;
grant select on public.agency_client_access to authenticated;
grant all on public.agency_clients,public.agency_client_access,public.agency_records to service_role;
create policy clients_read on public.agency_clients for select to authenticated using(private.agency_view(id));
create policy clients_create on public.agency_clients for insert to authenticated with check(exists(select 1 from public.team_members m where m.team_id=agency_clients.team_id and m.user_id=(select auth.uid())));
create policy clients_update on public.agency_clients for update to authenticated using(private.agency_staff(id)) with check(exists(select 1 from public.team_members m where m.team_id=agency_clients.team_id and m.user_id=(select auth.uid())));
create policy access_read on public.agency_client_access for select to authenticated using(user_id=(select auth.uid()) or private.agency_staff(client_id));
create policy records_read on public.agency_records for select to authenticated using(private.agency_staff(client_id) or (private.agency_view(client_id) and visibility='shared' and kind<>'automation' and (kind<>'report' or status='published')));
create policy records_create on public.agency_records for insert to authenticated with check(private.agency_staff(client_id) and created_by=(select auth.uid()));
create policy records_update on public.agency_records for update to authenticated using(private.agency_staff(client_id)) with check(private.agency_staff(client_id));
create or replace function public.agency_grant_access(cid uuid, target_email text) returns void
language plpgsql security definer set search_path='' as $$
declare target_id uuid;
begin
 if auth.uid() is null or not exists(select 1 from public.agency_clients c join public.team_members m on m.team_id=c.team_id where c.id=cid and m.user_id=auth.uid() and m.role in ('owner','manager')) then raise exception 'Sem permissão para gerenciar acessos'; end if;
 select id into target_id from auth.users where lower(email)=lower(trim(target_email)) and email_confirmed_at is not null;
 if target_id is null then raise exception 'O cliente precisa criar e confirmar a conta antes de receber acesso'; end if;
 insert into public.agency_client_access(client_id,user_id) values(cid,target_id) on conflict do nothing;
end $$;
revoke all on function public.agency_grant_access(uuid,text) from public,anon;
grant execute on function public.agency_grant_access(uuid,text) to authenticated;
alter table public.meta_integration_sessions add column if not exists user_id uuid references auth.users(id);
create index if not exists meta_sessions_user_idx on public.meta_integration_sessions(user_id);
create function private.agency_preserve_published() returns trigger
language plpgsql set search_path='' as $$
begin
 if old.kind='report' and old.status='published' then raise exception 'Relatórios publicados são preservados. Crie uma nova versão.'; end if;
 if new.client_id<>old.client_id or new.kind<>old.kind or new.created_by is distinct from old.created_by then raise exception 'Não é permitido alterar a origem do registro'; end if;
 return new;
end $$;
create trigger agency_preserve_published before update on public.agency_records for each row execute function private.agency_preserve_published();
commit;
