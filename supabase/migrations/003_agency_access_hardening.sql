begin;
-- Team creation must be atomic; an outsider must never appoint themselves owner.
drop policy if exists "Users can add themselves as first owner" on public.team_members;
drop policy if exists "Authenticated users can create teams" on public.teams;
create function public.agency_create_team(team_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare tid uuid; actor uuid:=auth.uid(); actor_email text;
begin
 if actor is null then raise exception 'Autenticação necessária'; end if;
 if length(trim(team_name)) not between 2 and 120 then raise exception 'Nome inválido'; end if;
 select email into actor_email from auth.users where id=actor;
 insert into public.teams(name,created_by) values(trim(team_name),actor) returning id into tid;
 insert into public.team_members(team_id,user_id,email,role) values(tid,actor,actor_email,'owner');
 return tid;
end $$;
revoke all on function public.agency_create_team(text) from public,anon;
grant execute on function public.agency_create_team(text) to authenticated;
drop policy if exists "Managers can create invitations" on public.team_invitations;
drop policy if exists "Managers can update invitations" on public.team_invitations;
create policy invitations_create_safe on public.team_invitations for insert to authenticated with check(invited_by=(select auth.uid()) and (private.current_user_team_role(team_id)='owner' or (private.current_user_team_role(team_id)='manager' and role='operator')));
create policy invitations_update_safe on public.team_invitations for update to authenticated using(private.current_user_team_role(team_id)='owner' or (private.current_user_team_role(team_id)='manager' and role='operator')) with check(private.current_user_team_role(team_id)='owner' or (private.current_user_team_role(team_id)='manager' and role='operator'));
commit;
