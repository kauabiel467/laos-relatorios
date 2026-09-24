-- Run against a database that already has 20260924120000_report_automations.sql.
-- Everything happens inside one transaction that is rolled back at the end.
begin;

insert into auth.users(id,email,email_confirmed_at) values
 ('aeaa0000-0000-4000-8000-0000000000a1','auto-owner@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-0000000000a2','auto-operator@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-0000000000a3','auto-viewer@example.invalid',now()),
 ('aeaa0000-0000-4000-8000-0000000000a4','auto-outsider@example.invalid',now());
insert into public.teams(id,name,created_by) values('aebb0000-0000-4000-8000-0000000000a1','Automation RLS test','aeaa0000-0000-4000-8000-0000000000a1');
insert into public.team_members(team_id,user_id,role) values
 ('aebb0000-0000-4000-8000-0000000000a1','aeaa0000-0000-4000-8000-0000000000a1','owner'),
 ('aebb0000-0000-4000-8000-0000000000a1','aeaa0000-0000-4000-8000-0000000000a2','operator');
insert into public.agency_clients(id,team_id,name) values
 ('aecc0000-0000-4000-8000-0000000000a1','aebb0000-0000-4000-8000-0000000000a1','Auto client'),
 ('aecc0000-0000-4000-8000-0000000000a2','aebb0000-0000-4000-8000-0000000000a1','Other client');
insert into public.agency_client_access(client_id,user_id,email,role,granted_by) values
 ('aecc0000-0000-4000-8000-0000000000a1','aeaa0000-0000-4000-8000-0000000000a3','auto-viewer@example.invalid','viewer','aeaa0000-0000-4000-8000-0000000000a1');
insert into public.agency_documents(id,client_id,kind,title,config,data,status,created_by) values
 ('aedd0000-0000-4000-8000-0000000000a1','aecc0000-0000-4000-8000-0000000000a1','dashboard','Dash','{}','{}','draft','aeaa0000-0000-4000-8000-0000000000a1'),
 ('aedd0000-0000-4000-8000-0000000000a2','aecc0000-0000-4000-8000-0000000000a2','dashboard','Other dash','{}','{}','draft','aeaa0000-0000-4000-8000-0000000000a1'),
 ('aedd0000-0000-4000-8000-0000000000a3','aecc0000-0000-4000-8000-0000000000a1','report','A report','{}','{}','draft','aeaa0000-0000-4000-8000-0000000000a1');

-- 1. Owner: can create; everything the database promises is enforced.
set local role authenticated;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-0000000000a1',true);
do $$
declare aid uuid;
begin
 insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,run_time,timezone,recipient,created_by)
 values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a1','Rotina','sales','friday_sunday',1,'09:00','America/Sao_Paulo','{"type":"phone","phone":"+5511999999999"}','aeaa0000-0000-4000-8000-0000000000a1')
 returning id into aid;
 if (select status from public.agency_report_automations where id=aid)<>'paused' then raise exception 'New automations must start paused';end if;
 -- another project's dashboard, a report instead of a dashboard, a bad timezone, a secret in the recipient, forged author
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a2','X1','sales','friday_sunday',1,'America/Sao_Paulo','aeaa0000-0000-4000-8000-0000000000a1');raise exception 'Cross-project dashboard accepted';exception when foreign_key_violation then null;end;
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a3','X2','sales','friday_sunday',1,'America/Sao_Paulo','aeaa0000-0000-4000-8000-0000000000a1');raise exception 'Report accepted as automation target';exception when raise_exception then if sqlerrm not like '%dashboard%' then raise;end if;end;
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a1','X3','sales','friday_sunday',1,'Mars/Olympus','aeaa0000-0000-4000-8000-0000000000a1');raise exception 'Invalid timezone accepted';exception when raise_exception then if sqlerrm not like '%Fuso%' then raise;end if;end;
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,recipient,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a1','X4','sales','friday_sunday',1,'America/Sao_Paulo','{"type":"phone","access_token":"x"}','aeaa0000-0000-4000-8000-0000000000a1');raise exception 'Secret accepted in recipient';exception when check_violation then null;end;
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a1','X5','sales','friday_sunday',1,'America/Sao_Paulo','aeaa0000-0000-4000-8000-0000000000a2');raise exception 'Forged created_by accepted';exception when insufficient_privilege then null;end;
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a1','Rotina','sales','friday_sunday',1,'America/Sao_Paulo','aeaa0000-0000-4000-8000-0000000000a1');raise exception 'Duplicate name accepted';exception when unique_violation then null;end;
 begin update public.agency_report_automations set last_run_at=now() where id=aid;raise exception 'last_run_at writable by users';exception when insufficient_privilege then null;end;
 begin update public.agency_report_automations set client_id='aecc0000-0000-4000-8000-0000000000a2' where id=aid;raise exception 'client_id writable by users';exception when insufficient_privilege then null;end;
 update public.agency_report_automations set status='active' where id=aid;
 if not found then raise exception 'Owner cannot pause/activate';end if;
end $$;

-- 2. Operator: may read, must not write.
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-0000000000a2',true);
do $$
begin
 if (select count(*) from public.agency_report_automations)<>1 then raise exception 'Operator cannot read automations';end if;
 update public.agency_report_automations set status='paused';
 if found then raise exception 'Operator edited an automation';end if;
 delete from public.agency_report_automations;
 if found then raise exception 'Operator deleted an automation';end if;
 begin insert into public.agency_report_automations(client_id,document_id,name,message_template,period_preset,run_weekday,timezone,created_by) values('aecc0000-0000-4000-8000-0000000000a1','aedd0000-0000-4000-8000-0000000000a1','By operator','sales','friday_sunday',1,'America/Sao_Paulo','aeaa0000-0000-4000-8000-0000000000a2');raise exception 'Operator created an automation';exception when insufficient_privilege then null;end;
end $$;

-- 3. Client viewer and outsider: see nothing, write nothing.
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-0000000000a3',true);
do $$ begin
 if (select count(*) from public.agency_report_automations)<>0 then raise exception 'Client viewer can read automations';end if;
 if (select count(*) from public.agency_report_automation_runs)<>0 then raise exception 'Client viewer can read runs';end if;
end $$;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-0000000000a4',true);
do $$ begin
 if (select count(*) from public.agency_report_automations)<>0 then raise exception 'Outsider can read automations';end if;
end $$;

-- 4. anon: no access at all.
reset role;
set local role anon;
do $$ begin
 begin perform 1 from public.agency_report_automations;raise exception 'anon can read automations';exception when insufficient_privilege then null;end;
 begin perform 1 from public.agency_report_automation_runs;raise exception 'anon can read runs';exception when insufficient_privilege then null;end;
end $$;
reset role;

-- 5. Runs: written only by the backend; a finished run is history.
do $$
declare aid uuid; rid uuid;
begin
 select id into aid from public.agency_report_automations where name='Rotina';
 insert into public.agency_report_automation_runs(automation_id,client_id,scheduled_for,timezone,period_preset,period_since,period_until,compare_since,compare_until,message_template)
 values(aid,'aecc0000-0000-4000-8000-0000000000a1','2026-09-28 12:00+00','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','2026-09-18','2026-09-20','sales') returning id into rid;
 -- an automation can never write a run for another project
 begin insert into public.agency_report_automation_runs(automation_id,client_id,scheduled_for,timezone,period_preset,period_since,period_until,message_template) values(aid,'aecc0000-0000-4000-8000-0000000000a2','2026-09-29 12:00+00','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','sales');raise exception 'Run accepted for another project';exception when foreign_key_violation then null;end;
 -- same slot twice is refused (idempotency for the future scheduler)
 begin insert into public.agency_report_automation_runs(automation_id,client_id,scheduled_for,timezone,period_preset,period_since,period_until,message_template) values(aid,'aecc0000-0000-4000-8000-0000000000a1','2026-09-28 12:00+00','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','sales');raise exception 'Duplicate run slot accepted';exception when unique_violation then null;end;
 -- a failure must say why
 begin update public.agency_report_automation_runs set status='failed' where id=rid;raise exception 'Failed run without error accepted';exception when check_violation then null;end;
 update public.agency_report_automation_runs set status='running',started_at=now() where id=rid;
 begin update public.agency_report_automation_runs set status='scheduled' where id=rid;raise exception 'Run moved backwards';exception when raise_exception then if sqlerrm not like '%estado anterior%' then raise;end if;end;
 begin update public.agency_report_automation_runs set period_since='2026-09-01' where id=rid;raise exception 'Run period changed';exception when raise_exception then if sqlerrm not like '%período%' then raise;end if;end;
 update public.agency_report_automation_runs set report_snapshot='{"title":"A","config":{},"data":{}}',report_share_token=gen_random_uuid() where id=rid;
 begin update public.agency_report_automation_runs set report_snapshot='{"title":"B"}' where id=rid;raise exception 'Snapshot rewritten';exception when raise_exception then if sqlerrm not like '%snapshot%' then raise;end if;end;
 update public.agency_report_automation_runs set status='sent',finished_at=now(),message_text='Olá',provider_message_id='wamid.1' where id=rid;
 begin update public.agency_report_automation_runs set message_text='changed' where id=rid;raise exception 'Finished run edited';exception when raise_exception then if sqlerrm not like '%imutáveis%' then raise;end if;end;
 begin update public.agency_report_automation_runs set status='failed',error_message='x' where id=rid;raise exception 'Finished run reopened';exception when raise_exception then if sqlerrm not like '%imutáveis%' then raise;end if;end;
 update public.agency_report_automation_runs set report_share_token=null where id=rid;  -- switching the public link off is allowed
 -- a retry is a new row
 insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template) values(aid,'aecc0000-0000-4000-8000-0000000000a1',2,'2026-09-28 12:00+00','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','sales');
 -- history keeps the automation: it cannot be deleted while it has runs
 begin delete from public.agency_report_automations where id=aid;raise exception 'Automation with history deleted';exception when foreign_key_violation then null;end;
end $$;

-- 6. Users can read runs of their project but never write them.
set local role authenticated;
select set_config('request.jwt.claim.sub','aeaa0000-0000-4000-8000-0000000000a2',true);
do $$ begin
 if (select count(*) from public.agency_report_automation_runs)<>2 then raise exception 'Team member cannot read runs';end if;
 begin insert into public.agency_report_automation_runs(automation_id,client_id,scheduled_for,timezone,period_preset,period_since,period_until,message_template) select id,client_id,now(),'UTC','friday_sunday','2026-09-25','2026-09-27','sales' from public.agency_report_automations;raise exception 'Run forged from the browser';exception when insufficient_privilege then null;end;
 begin update public.agency_report_automation_runs set message_text='forged';raise exception 'Run edited from the browser';exception when insufficient_privilege then null;end;
 begin delete from public.agency_report_automation_runs;raise exception 'Run deleted from the browser';exception when insufficient_privilege then null;end;
end $$;
reset role;

rollback;
select 'report automations RLS: ok' as result;
