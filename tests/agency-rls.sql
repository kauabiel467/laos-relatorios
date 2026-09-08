begin;
insert into auth.users(id,email,email_confirmed_at) values
 ('aeaa0000-0000-4000-8000-000000000001','laos-test-staff@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-000000000002','laos-test-client@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-000000000003','laos-test-outsider@example.invalid',now());
insert into public.teams(id,name,created_by) values('aebb0000-0000-4000-8000-000000000001','RLS test','aeaa0000-0000-4000-8000-000000000001');
insert into public.team_members(team_id,user_id,role) values('aebb0000-0000-4000-8000-000000000001','aeaa0000-0000-4000-8000-000000000001','owner');
insert into public.agency_clients(id,team_id,name) values('aecc0000-0000-4000-8000-000000000001','aebb0000-0000-4000-8000-000000000001','Test client');
insert into public.agency_client_access values('aecc0000-0000-4000-8000-000000000001','aeaa0000-0000-4000-8000-000000000002');
insert into public.agency_records(client_id,kind,title,visibility,status,created_by) values
 ('aecc0000-0000-4000-8000-000000000001','timeline','Internal','internal','active','aeaa0000-0000-4000-8000-000000000001'),
 ('aecc0000-0000-4000-8000-000000000001','timeline','Shared','shared','active','aeaa0000-0000-4000-8000-000000000001'),
 ('aecc0000-0000-4000-8000-000000000001','report','Draft','shared','draft','aeaa0000-0000-4000-8000-000000000001'),
 ('aecc0000-0000-4000-8000-000000000001','report','Published','shared','published','aeaa0000-0000-4000-8000-000000000001');
set local role authenticated;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-000000000002',true);
do $$ begin
 if (select count(*) from public.agency_records where client_id='aecc0000-0000-4000-8000-000000000001')<>2 then raise exception 'Client visibility failed';end if;
 update public.agency_records set title='Unauthorized edit' where client_id='aecc0000-0000-4000-8000-000000000001';
 if found then raise exception 'Client write isolation failed';end if;
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
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-000000000001',true);
do $$ begin
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
select 'PASS: client visibility, no client writes, outsider isolation, no ownership takeover, atomic teams, staff drafts, immutable publication, anonymous isolation; fixtures rolled back' as result;
