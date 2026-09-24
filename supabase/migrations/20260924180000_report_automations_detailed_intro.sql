begin;

-- Optional custom lead-in for the detailed-report link that an automation appends
-- to its message. Null means "use the default text". Additive and nullable, so
-- existing rows and the deployed code keep working untouched.
alter table public.agency_report_automations
  add column if not exists detailed_report_intro text
  check (detailed_report_intro is null or length(btrim(detailed_report_intro)) between 1 and 300);

-- Column-level grants are explicit (see the first automations migration), so the
-- new column has to be added to them.
grant insert (detailed_report_intro) on public.agency_report_automations to authenticated;
grant update (detailed_report_intro) on public.agency_report_automations to authenticated;

comment on column public.agency_report_automations.detailed_report_intro is
  'Texto de introdução do link do relatório detalhado na mensagem. Nulo = texto padrão.';

commit;
