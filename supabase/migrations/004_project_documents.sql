begin;
create table public.agency_documents (
 id uuid primary key default gen_random_uuid(), client_id uuid not null references public.agency_clients(id),
 kind text not null check(kind in ('dashboard','report','template')),title text not null check(length(title) between 1 and 180),
 config jsonb not null,data jsonb,status text not null default 'draft' check(status in ('draft','published')),
 created_by uuid not null references auth.users(id),created_at timestamptz not null default now(),updated_at timestamptz not null default now()
);
create index agency_documents_client_idx on public.agency_documents(client_id,created_at desc);
alter table public.agency_documents enable row level security;
revoke all on public.agency_documents from anon,authenticated;
grant select,insert,update,delete on public.agency_documents to authenticated;
grant all on public.agency_documents to service_role;
create policy documents_read on public.agency_documents for select to authenticated using(private.agency_staff(client_id) or (private.agency_view(client_id) and status='published' and kind<>'template'));
create policy documents_insert on public.agency_documents for insert to authenticated with check(private.agency_staff(client_id) and created_by=(select auth.uid()));
create policy documents_update on public.agency_documents for update to authenticated using(private.agency_staff(client_id)) with check(private.agency_staff(client_id));
create policy documents_delete on public.agency_documents for delete to authenticated using(private.agency_staff(client_id) and status='draft');
create function private.protect_project_document() returns trigger language plpgsql set search_path='' as $$ begin
 if old.kind='report' and old.status='published' then raise exception 'Relatório publicado não pode ser alterado. Duplique para criar uma nova versão.';end if;
 if new.client_id<>old.client_id or new.kind<>old.kind or new.created_by<>old.created_by then raise exception 'Origem do documento não pode ser alterada';end if;
 if new.status='published' and new.data is null then raise exception 'Importe os resultados antes de publicar';end if;
 new.updated_at=now();return new;end $$;
create trigger protect_project_document before update on public.agency_documents for each row execute function private.protect_project_document();
-- Credentials stay in a separate server-only mapping, never in the client-facing project row.
create table public.agency_meta_connections(client_id uuid primary key references public.agency_clients(id),session_id uuid not null references public.meta_integration_sessions(id) on delete cascade,account_id text not null,connected_by uuid not null references auth.users(id),connected_at timestamptz not null default now());
alter table public.agency_meta_connections enable row level security;
revoke all on public.agency_meta_connections from anon,authenticated;
grant all on public.agency_meta_connections to service_role;
alter table public.agency_clients add column if not exists logo_url text;
alter table public.agency_clients add column if not exists meta_connected_at timestamptz;
commit;
