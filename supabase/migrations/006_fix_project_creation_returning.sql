begin;

-- PostgREST returns the newly inserted project in the same INSERT statement.
-- The previous SELECT policy only called agency_view(id), whose helper looked
-- the new id up in agency_clients and could not see it in that statement's
-- snapshot. The INSERT itself passed RLS, but INSERT ... RETURNING was denied.
-- Use the row's team_id for agency members and retain agency_view for clients
-- who were granted explicit access.
drop policy if exists clients_read on public.agency_clients;
create policy clients_read
on public.agency_clients
for select
to authenticated
using (
  private.current_user_team_role(team_id) is not null
  or private.agency_view(id)
);

commit;
