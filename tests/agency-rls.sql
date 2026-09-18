begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aeaa0000-0000-4000-8000-000000000001','laos-test-staff@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-000000000002','laos-test-client@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-000000000003','laos-test-outsider@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-000000000004','laos-test-invited@example.invalid',now());
insert into public.teams(id,name,created_by) values('aebb0000-0000-4000-8000-000000000001','RLS test','aeaa0000-0000-4000-8000-000000000001');
insert into public.team_members(team_id,user_id,role) values('aebb0000-0000-4000-8000-000000000001','aeaa0000-0000-4000-8000-000000000001','owner');
insert into public.agency_clients(id,team_id,name) values('aecc0000-0000-4000-8000-000000000001','aebb0000-0000-4000-8000-000000000001','Test client');
insert into public.agency_client_access(client_id,user_id,email,role,granted_by)
values(
 'aecc0000-0000-4000-8000-000000000001',
 'aeaa0000-0000-4000-8000-000000000002',
 'laos-test-client@example.invalid',
 'viewer',
 'aeaa0000-0000-4000-8000-000000000001'
);
insert into public.agency_client_invitations(client_id,email,role,status,invited_by)
values(
 'aecc0000-0000-4000-8000-000000000001',
 'laos-test-invited@example.invalid',
 'viewer',
 'pending',
 'aeaa0000-0000-4000-8000-000000000001'
);
insert into public.agency_records(client_id,kind,title,visibility,status,created_by) values
 ('aecc0000-0000-4000-8000-000000000001','timeline','Internal','internal','active','aeaa0000-0000-4000-8000-000000000001'),
 ('aecc0000-0000-4000-8000-000000000001','timeline','Shared','shared','active','aeaa0000-0000-4000-8000-000000000001'),
 ('aecc0000-0000-4000-8000-000000000001','report','Draft','shared','draft','aeaa0000-0000-4000-8000-000000000001'),
 ('aecc0000-0000-4000-8000-000000000001','report','Published','shared','published','aeaa0000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.agency_records where client_id='aecc0000-0000-4000-8000-000000000001')<>2 then raise exception 'Client visibility failed';end if;
 if exists(select 1 from public.agency_client_invitations where client_id='aecc0000-0000-4000-8000-000000000001') then raise exception 'Client invitation details exposed';end if;
 update public.agency_records set title='Unauthorized edit' where client_id='aecc0000-0000-4000-8000-000000000001';
 if found then raise exception 'Client write isolation failed';end if;
 begin
 perform public.agency_grant_access('aecc0000-0000-4000-8000-000000000001','takeover@example.invalid');
 raise exception 'Client grant access allowed';
 exception when others then if sqlerrm='Client grant access allowed' then raise;end if;end;
 begin
 perform public.agency_revoke_access('aecc0000-0000-4000-8000-000000000001','aeaa0000-0000-4000-8000-000000000002');
 raise exception 'Client revoke access allowed';
 exception when others then if sqlerrm='Client revoke access allowed' then raise;end if;end;
 begin
 insert into public.agency_records(client_id,kind,title,created_by) values('aecc0000-0000-4000-8000-000000000001','timeline','Unauthorized insert','aeaa0000-0000-4000-8000-000000000002');
 raise exception 'Client insert isolation failed';
 exception when insufficient_privilege then null;end;
end $$;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from public.agency_clients where id='aecc0000-0000-4000-8000-000000000001') then raise exception 'Cross-client isolation failed';end if;
 begin
 insert into public.team_members(team_id,user_id,role) values('aebb0000-0000-4000-8000-000000000001','aeaa0000-0000-4000-8000-000000000003','owner');
 raise exception 'Ownership takeover allowed';
 exception when insufficient_privilege then null;end;
 perform public.agency_create_team('Atomic team test');
 if not exists(select 1 from public.team_members where user_id=auth.uid() and role='owner') then raise exception 'Atomic creation failed';end if;
end $$;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-000000000004',true);
do $$ declare accepted integer; begin
 if exists(select 1 from public.agency_clients where id='aecc0000-0000-4000-8000-000000000001') then raise exception 'Invite granted access before acceptance';end if;
 accepted := public.agency_accept_client_invitations();
 if accepted<>1 then raise exception 'Pending invitation was not accepted';end if;
 if not exists(select 1 from public.agency_clients where id='aecc0000-0000-4000-8000-000000000001') then raise exception 'Accepted client cannot see project';end if;
 if not exists(
   select 1 from public.agency_client_access
   where client_id='aecc0000-0000-4000-8000-000000000001'
     and user_id='aeaa0000-0000-4000-8000-000000000004'
     and role='viewer'
 ) then raise exception 'Accepted invitation has no viewer access';end if;
end $$;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-000000000001',true);
do $$ declare created_client_id uuid; invitation_id uuid; invitation_result text; begin
 insert into public.agency_clients(team_id,name)
 values('aebb0000-0000-4000-8000-000000000001','Created through returning')
 returning id into created_client_id;
 if created_client_id is null then raise exception 'Project insert returning failed';end if;
 if not exists(
   select 1 from public.agency_clients
   where id=created_client_id
     and language='pt-BR'
     and currency='BRL'
     and date_format='DD/MM/YYYY'
     and decimal_separator=','
     and thousands_separator='.'
     and timezone='America/Sao_Paulo'
 ) then raise exception 'Project preference defaults were not persisted';end if;
 begin
   update public.agency_clients
   set decimal_separator='.',thousands_separator='.'
   where id=created_client_id;
   raise exception 'Equal number separators accepted';
 exception when check_violation then null;end;
 begin
   update public.agency_clients set onboarding_step=5 where id=created_client_id;
   raise exception 'Invalid onboarding step accepted';
 exception when check_violation then null;end;
 if public.agency_grant_access(
   'aecc0000-0000-4000-8000-000000000001',
   ' LAOS-TEST-CLIENT@EXAMPLE.INVALID '
 )<>'accepted' then raise exception 'Confirmed account was not granted immediately';end if;
 invitation_result := public.agency_grant_access(
   'aecc0000-0000-4000-8000-000000000001',
   ' NEW-CLIENT@EXAMPLE.INVALID '
 );
 if invitation_result<>'pending' then raise exception 'Unknown account invitation was not persisted';end if;
 select id into invitation_id
 from public.agency_client_invitations
 where client_id='aecc0000-0000-4000-8000-000000000001'
   and email='new-client@example.invalid'
   and role='viewer'
   and status='pending';
 if invitation_id is null then raise exception 'Pending invitation not found';end if;
 perform public.agency_revoke_invitation('aecc0000-0000-4000-8000-000000000001',invitation_id);
 if not exists(select 1 from public.agency_client_invitations where id=invitation_id and status='revoked') then raise exception 'Invitation was not revoked';end if;
 perform public.agency_revoke_access(
   'aecc0000-0000-4000-8000-000000000001',
   'aeaa0000-0000-4000-8000-000000000004'
 );
 if exists(
   select 1 from public.agency_client_access
   where client_id='aecc0000-0000-4000-8000-000000000001'
     and user_id='aeaa0000-0000-4000-8000-000000000004'
 ) then raise exception 'Client access was not revoked';end if;
 begin
   perform public.agency_grant_access('aecc0000-0000-4000-8000-000000000001','invalid-email');
   raise exception 'Invalid invite email accepted';
 exception when others then if sqlerrm='Invalid invite email accepted' then raise;end if;end;
 if (select count(*) from public.agency_records where client_id='aecc0000-0000-4000-8000-000000000001')<>4 then raise exception 'Staff visibility failed';end if;
 update public.agency_records set title='Edited draft' where client_id='aecc0000-0000-4000-8000-000000000001' and status='draft';
 if not found then raise exception 'Draft update failed';end if;
 begin
 update public.agency_records set title='Edited publication' where client_id='aecc0000-0000-4000-8000-000000000001' and status='published';
 raise exception 'Published report changed';
 exception when raise_exception then if sqlerrm='Published report changed' then raise;end if;end;
end $$;
set local role anon;
do $$ begin
 begin perform 1 from public.agency_records; raise exception 'Anonymous read permitted';exception when insufficient_privilege then null;end;
end $$;
rollback;
select 'PASS: project preferences, pending/accepted/revoked client access, RLS, project insert returning, client visibility, no client writes, outsider isolation, no ownership takeover, atomic teams, staff drafts, immutable publication, anonymous isolation; fixtures rolled back' as result;
