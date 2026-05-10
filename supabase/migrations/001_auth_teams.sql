create type public.team_role as enum ('owner', 'manager', 'operator');
create type public.team_invitation_status as enum ('pending', 'accepted', 'revoked');

create table public.teams (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);

create table public.team_members (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  email text,
  role public.team_role not null default 'operator',
  created_at timestamptz not null default now(),
  unique (team_id, user_id)
);

create table public.team_invitations (
  id uuid primary key default gen_random_uuid(),
  team_id uuid not null references public.teams(id) on delete cascade,
  email text not null,
  role public.team_role not null default 'operator',
  status public.team_invitation_status not null default 'pending',
  invited_by uuid references auth.users(id) on delete set null,
  accepted_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  unique (team_id, email, status)
);

alter table public.teams enable row level security;
alter table public.team_members enable row level security;
alter table public.team_invitations enable row level security;

grant usage on schema public to authenticated;
grant select, insert, update, delete on public.teams to authenticated;
grant select, insert, update, delete on public.team_members to authenticated;
grant select, insert, update, delete on public.team_invitations to authenticated;

create schema if not exists private;
grant usage on schema private to authenticated;

create or replace function private.current_user_team_role(target_team_id uuid)
returns public.team_role
language sql
security definer
set search_path = public
as $$
  select role
  from public.team_members
  where team_id = target_team_id
    and user_id = auth.uid()
  limit 1
$$;

create policy "Members can read their teams"
on public.teams for select
using (private.current_user_team_role(id) is not null);

create policy "Authenticated users can create teams"
on public.teams for insert
with check (auth.uid() is not null);

create policy "Owners can update teams"
on public.teams for update
using (private.current_user_team_role(id) = 'owner')
with check (private.current_user_team_role(id) = 'owner');

create policy "Members can read team members"
on public.team_members for select
using (private.current_user_team_role(team_id) is not null);

create policy "Users can add themselves as first owner"
on public.team_members for insert
with check (
  auth.uid() = user_id
  and role = 'owner'
  and not exists (
    select 1 from public.team_members existing
    where existing.team_id = team_members.team_id
  )
);

create policy "Owners can manage members"
on public.team_members for update
using (private.current_user_team_role(team_id) = 'owner')
with check (private.current_user_team_role(team_id) = 'owner');

create policy "Owners can remove members"
on public.team_members for delete
using (private.current_user_team_role(team_id) = 'owner');

create policy "Managers can read invitations"
on public.team_invitations for select
using (private.current_user_team_role(team_id) in ('owner', 'manager'));

create policy "Managers can create invitations"
on public.team_invitations for insert
with check (private.current_user_team_role(team_id) in ('owner', 'manager'));

create policy "Managers can update invitations"
on public.team_invitations for update
using (private.current_user_team_role(team_id) in ('owner', 'manager'))
with check (private.current_user_team_role(team_id) in ('owner', 'manager'));
