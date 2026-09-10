begin;

-- The legacy table contains two preserved reports but is not used by the new
-- project workspace. Keep the rows server-only until ownership can be mapped.
alter table public.relatorios enable row level security;
drop policy if exists "Acesso total" on public.relatorios;
revoke all privileges on table public.relatorios from anon, authenticated;
grant all privileges on table public.relatorios to service_role;
create policy legacy_reports_server_only
on public.relatorios for all to authenticated
using (false)
with check (false);

comment on table public.relatorios is
  'Relatorios legados preservados. Acesso direto bloqueado ate a migracao com proprietario e projeto definidos.';

-- The project/Meta mapping contains account identifiers and session links.
-- The service role bypasses RLS; authenticated clients must never query it.
drop policy if exists meta_connections_no_direct_access on public.agency_meta_connections;
create policy meta_connections_no_direct_access
on public.agency_meta_connections for all to authenticated
using (false)
with check (false);

-- Make the trigger independent from objects that could shadow names on the
-- caller's search path.
alter function public.set_meta_integration_sessions_updated_at()
set search_path = '';

-- Foreign-key indexes required by deletes, joins and agency portfolio reads.
create index if not exists agency_documents_created_by_idx
  on public.agency_documents(created_by);
create index if not exists agency_meta_connections_session_idx
  on public.agency_meta_connections(session_id);
create index if not exists agency_meta_connections_connected_by_idx
  on public.agency_meta_connections(connected_by);
create index if not exists agency_records_created_by_idx
  on public.agency_records(created_by);
create index if not exists team_invitations_accepted_by_idx
  on public.team_invitations(accepted_by);
create index if not exists team_invitations_invited_by_idx
  on public.team_invitations(invited_by);
create index if not exists team_members_user_idx
  on public.team_members(user_id);
create index if not exists teams_created_by_idx
  on public.teams(created_by);

commit;
