-- Run against a database that has 20260924120000_report_automations.sql AND
-- 20260925120000_report_automation_executor.sql. Everything happens inside one
-- transaction that is rolled back at the end.
begin;

insert into auth.users(id,email,email_confirmed_at) values
 ('afaa0000-0000-4000-8000-0000000000b1','exec-owner@example.invalid',now());
insert into public.teams(id,name,created_by) values('afbb0000-0000-4000-8000-0000000000b1','Executor test','afaa0000-0000-4000-8000-0000000000b1');
insert into public.team_members(team_id,user_id,role) values('afbb0000-0000-4000-8000-0000000000b1','afaa0000-0000-4000-8000-0000000000b1','owner');
insert into public.agency_clients(id,team_id,name) values('afcc0000-0000-4000-8000-0000000000b1','afbb0000-0000-4000-8000-0000000000b1','Exec client');
insert into public.agency_documents(id,client_id,kind,title,config,data,status,created_by,share_token,published_snapshot,published_at) values
 ('afdd0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1','dashboard','Dash','{}','{}','published','afaa0000-0000-4000-8000-0000000000b1',
  'afee0000-0000-4000-8000-0000000000b9','{"title":"PUBLICADO","config":{},"data":{}}',now());
insert into public.agency_report_automations(id,client_id,document_id,name,message_template,period_preset,run_weekday,run_time,timezone,recipient,created_by,status) values
 ('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1','afdd0000-0000-4000-8000-0000000000b1','A1','overview','friday_sunday',1,'09:00','America/Sao_Paulo','{"type":"phone","phone":"+5511999998888"}','afaa0000-0000-4000-8000-0000000000b1','active'),
 ('afaf0000-0000-4000-8000-0000000000b2','afcc0000-0000-4000-8000-0000000000b1','afdd0000-0000-4000-8000-0000000000b1','A2','overview','monday_sunday',1,'09:00','America/Sao_Paulo','{"type":"phone","phone":"+5511999998888"}','afaa0000-0000-4000-8000-0000000000b1','active');

-- Runs are written by the backend only (service role); simulate it.
set local role service_role;
do $$
declare r1 uuid; r2 uuid; child uuid; tok uuid := 'afee0000-0000-4000-8000-0000000000c1'; n int;
begin
 -- 1. A run is created with the new columns and safe defaults.
 insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,compare_since,compare_until,message_template,idempotency_key,recipient_label,provider)
 values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',1,'2026-09-28T12:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','2026-09-18','2026-09-20','overview','scheduled:A1:2026-09-28:a1','+55 •••••8888','whatsapp_cloud_api')
 returning id into r1;
 if (select trigger_type from public.agency_report_automation_runs where id=r1)<>'scheduled' then raise exception 'trigger_type default';end if;
 if (select retryable from public.agency_report_automation_runs where id=r1) then raise exception 'retryable must default to false';end if;

 -- 2. Idempotency: the same key, or the same slot, can never exist twice.
 begin insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key)
  values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',9,'2026-09-30T12:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview','scheduled:A1:2026-09-28:a1');
  raise exception 'Duplicate idempotency key accepted';exception when unique_violation then null;end;
 begin insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key)
  values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',1,'2026-09-28T12:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview','another-key');
  raise exception 'Duplicate slot accepted';exception when unique_violation then null;end;
 begin insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key,trigger_type)
  values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',5,'2026-10-01T12:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview','bogus-trigger','bogus');
  raise exception 'Bad trigger_type accepted';exception when check_violation then null;end;

 -- 3. The claim is atomic: only the first scheduled->running update matches.
 update public.agency_report_automation_runs set status='running',started_at=now() where id=r1 and status='scheduled';
 get diagnostics n = row_count; if n<>1 then raise exception 'first claim must win';end if;
 update public.agency_report_automation_runs set status='running',started_at=now() where id=r1 and status='scheduled';
 get diagnostics n = row_count; if n<>0 then raise exception 'second claim must lose';end if;

 -- 4. While running: message + frozen report + own token in one update; then they are locked.
 update public.agency_report_automation_runs set message_text='hello',report_snapshot='{"title":"Snap","config":{"k":1},"data":{"current":{"spend":1}}}',report_share_token=tok where id=r1;
 begin update public.agency_report_automation_runs set report_snapshot='{"title":"Other"}' where id=r1;raise exception 'Snapshot rewritten';exception when raise_exception then if sqlerrm not like '%snapshot%' then raise;end if;end;
 begin update public.agency_report_automation_runs set report_share_token='afee0000-0000-4000-8000-0000000000c2' where id=r1;raise exception 'Token rewritten';exception when raise_exception then if sqlerrm not like '%link%' then raise;end if;end;
 begin update public.agency_report_automation_runs set trigger_type='manual' where id=r1;raise exception 'trigger_type changed';exception when raise_exception then if sqlerrm not like '%alterados%' then raise;end if;end;
 begin update public.agency_report_automation_runs set idempotency_key='x' where id=r1;raise exception 'idempotency_key changed';exception when raise_exception then if sqlerrm not like '%alterados%' then raise;end if;end;
 begin update public.agency_report_automation_runs set recipient_label='+55 full' where id=r1;raise exception 'recipient_label changed';exception when raise_exception then if sqlerrm not like '%alterados%' then raise;end if;end;
 -- retryable only makes sense on a failed run
 begin update public.agency_report_automation_runs set retryable=true where id=r1;raise exception 'retryable on a running run';exception when check_violation then null;end;

 -- 5. Failing needs a readable reason; a transient failure is retryable with a time.
 begin update public.agency_report_automation_runs set status='failed',finished_at=now() where id=r1;raise exception 'failed without message';exception when check_violation then null;end;
 update public.agency_report_automation_runs set status='failed',finished_at=now(),error_code='provider_unavailable',error_message='WhatsApp fora do ar',retryable=true,retry_after=now()+interval '5 minutes',provider_status='http_503' where id=r1;

 -- 6. A finished run is history: nothing changes, except switching its link off.
 begin update public.agency_report_automation_runs set message_text='edited' where id=r1;raise exception 'Finished run edited';exception when raise_exception then if sqlerrm not like '%imut%' then raise;end if;end;
 begin update public.agency_report_automation_runs set retryable=false where id=r1;raise exception 'Finished run edited (retryable)';exception when raise_exception then if sqlerrm not like '%imut%' then raise;end if;end;

 -- 7. A retry points at the attempt it repeats, in the SAME automation only.
 insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key,parent_run_id,trigger_type)
 values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',2,'2026-09-28T12:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview','retry:'||r1,r1,'scheduled')
 returning id into child;
 begin insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key,parent_run_id)
  values('afaf0000-0000-4000-8000-0000000000b2','afcc0000-0000-4000-8000-0000000000b1',2,'2026-09-28T12:00:00Z','America/Sao_Paulo','monday_sunday','2026-09-21','2026-09-27','overview','cross',r1);
  raise exception 'Retry pointing at another automation accepted';exception when foreign_key_violation then null;end;
 begin insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key,parent_run_id)
  values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',3,'2026-09-28T12:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview','retry:'||r1,r1);
  raise exception 'Second retry of the same run accepted';exception when unique_violation then null;end;

 -- 8. A test/manual run needs no schedule slot collision: distinct scheduled_for is enough.
 insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template,idempotency_key,trigger_type,requested_by)
 values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',1,'2026-09-30T15:00:00Z','America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview','test:A1:req1','test','afaa0000-0000-4000-8000-0000000000b1')
 returning id into r2;
end $$;

-- 9. Anonymous readers: only the run's own frozen report, only by its own token.
set local role anon;
do $$
declare n int; tok uuid := 'afee0000-0000-4000-8000-0000000000c1'; r record;
begin
 select * into r from public.get_public_automation_report(tok);
 if r.title is distinct from 'Snap' or r.data -> 'current' ->> 'spend' <> '1' then raise exception 'Run report not served by its own token';end if;
 if r.client_name <> 'Exec client' then raise exception 'client_name missing';end if;
 select count(*) into n from public.get_public_automation_report('afee0000-0000-4000-8000-0000000000ff'); if n<>0 then raise exception 'Wrong token served';end if;
 -- token spaces are isolated: the dashboard's share token does not open a run report, and vice versa.
 select count(*) into n from public.get_public_automation_report('afee0000-0000-4000-8000-0000000000b9'); if n<>0 then raise exception 'Dashboard token opened a run report';end if;
 select count(*) into n from public.get_public_dashboard(tok); if n<>0 then raise exception 'Run token opened the dashboard link';end if;
 -- the dashboard's publication is not what the run report shows
 if r.title = 'PUBLICADO' then raise exception 'Run report leaked the published snapshot';end if;
 begin perform 1 from public.agency_report_automation_runs limit 1;raise exception 'anon can read runs';exception when insufficient_privilege then null;end;
 begin perform 1 from public.agency_report_automations limit 1;raise exception 'anon can read automations';exception when insufficient_privilege then null;end;
end $$;

-- 10. Revoking a run's link (the only change a finished run accepts) closes it.
set local role service_role;
update public.agency_report_automation_runs set report_share_token=null where report_share_token='afee0000-0000-4000-8000-0000000000c1';
set local role anon;
do $$
declare n int;
begin
 select count(*) into n from public.get_public_automation_report('afee0000-0000-4000-8000-0000000000c1'); if n<>0 then raise exception 'Revoked link still opens';end if;
end $$;

-- 11. Team members read the history (new columns included); nobody writes it from the browser.
set local role authenticated;
select set_config('request.jwt.claim.sub','afaa0000-0000-4000-8000-0000000000b1',true);
do $$
declare n int;
begin
 select count(*) into n from public.agency_report_automation_runs where automation_id='afaf0000-0000-4000-8000-0000000000b1' and trigger_type is not null; if n<3 then raise exception 'Owner cannot read run history (%)',n;end if;
 begin insert into public.agency_report_automation_runs(automation_id,client_id,attempt,scheduled_for,timezone,period_preset,period_since,period_until,message_template) values('afaf0000-0000-4000-8000-0000000000b1','afcc0000-0000-4000-8000-0000000000b1',7,now(),'America/Sao_Paulo','friday_sunday','2026-09-25','2026-09-27','overview');raise exception 'Owner forged a run';exception when insufficient_privilege then null;end;
 begin update public.agency_report_automation_runs set retryable=true;raise exception 'Owner updated runs';exception when insufficient_privilege then null;end;
end $$;

-- 12. Supporting indexes exist.
reset role;
do $$
begin
 if (select count(*) from pg_indexes where schemaname='public' and indexname in ('agency_report_automation_runs_idempotency_key','agency_report_automation_runs_retry_idx','agency_report_automation_runs_open_idx','agency_report_automation_runs_parent_idx'))<>4 then raise exception 'Missing indexes';end if;
end $$;

select 'executor migration checks passed' as result;
rollback;
