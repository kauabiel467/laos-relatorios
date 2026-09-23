begin;

-- A dashboard becomes publicly viewable only when it carries a share token.
-- The token itself is the credential: whoever has it can read the dashboard
-- without logging in, so it must be unguessable and revocable.
alter table public.agency_documents add column if not exists share_token uuid unique;

-- Public reads never touch agency_documents/agency_clients directly (both
-- keep RLS enabled and grant nothing to anon). Instead they go through this
-- single security-definer function, the same pattern already used by
-- private.agency_staff/private.agency_view (see 002_agency_workspace.sql).
-- A wrong token, an unpublished document, or a non-dashboard kind must all
-- resolve to the same empty result — distinguishing them would let someone
-- probe for the existence of a token by trial and error.
create or replace function private.get_public_dashboard(p_token uuid)
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
  select d.title, d.config, d.data, d.updated_at, c.name, c.logo_url
  from public.agency_documents d
  join public.agency_clients c on c.id = d.client_id
  where d.share_token = p_token
    and d.status = 'published'
    and d.kind = 'dashboard'
$$;

revoke all on function private.get_public_dashboard(uuid) from public, anon, authenticated;
grant usage on schema private to anon;
grant execute on function private.get_public_dashboard(uuid) to anon;

comment on function private.get_public_dashboard(uuid) is
  'Leitura pública de um dashboard publicado pelo share_token. Token inválido, documento despublicado ou de outro tipo retornam zero linhas, sem distinção.';
comment on column public.agency_documents.share_token is
  'Token opaco que habilita a leitura pública do documento (somente kind=dashboard). Nulo enquanto não compartilhado; revogável a qualquer momento.';

commit;
