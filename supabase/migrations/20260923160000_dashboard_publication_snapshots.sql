begin;

-- The public share link must show the last PUBLISHED version of a dashboard,
-- not whatever the manager is editing right now. Publishing therefore stores
-- a frozen copy (published_snapshot) next to the live row; the public RPC reads
-- only that copy. Unpublishing clears it, which also switches the link off.
alter table public.agency_documents
  add column if not exists published_snapshot jsonb,
  add column if not exists published_at timestamptz,
  add column if not exists content_hash text,
  add column if not exists published_hash text,
  add column if not exists published_since date,
  add column if not exists published_until date;

-- content_hash fingerprints the editable content (title + config + data).
-- Comparing it with published_hash tells the editor, without shipping the whole
-- snapshot to the browser, whether there are changes not yet published.
create or replace function private.agency_documents_content_hash()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.content_hash := md5(
    coalesce(new.title, '') || '|' || coalesce(new.config::text, '') || '|' || coalesce(new.data::text, '')
  );
  return new;
end;
$$;

drop trigger if exists agency_documents_content_hash on public.agency_documents;
create trigger agency_documents_content_hash
before insert or update of title, config, data on public.agency_documents
for each row execute function private.agency_documents_content_hash();

-- Backfill. protect_project_document rejects any UPDATE to a published report,
-- so it is switched off just for this statement block (and only touches the two
-- new bookkeeping columns, never title/config/data).
alter table public.agency_documents disable trigger protect_project_document;

update public.agency_documents
set content_hash = md5(
  coalesce(title, '') || '|' || coalesce(config::text, '') || '|' || coalesce(data::text, '')
);

-- Dashboards already published keep working: their current content becomes
-- their first snapshot, so links generated before this migration do not break.
update public.agency_documents
set published_snapshot = jsonb_build_object('title', title, 'config', config, 'data', data),
    published_at = updated_at,
    published_hash = content_hash,
    -- In an UPDATE the right-hand side sees the OLD row, so the period is read
    -- from data/config (the very content being snapshotted), not from the new snapshot.
    published_since = coalesce(
      (data -> 'effective_period' ->> 'since')::date,
      (config ->> 'since')::date
    ),
    published_until = coalesce(
      (data -> 'effective_period' ->> 'until')::date,
      (config ->> 'until')::date
    )
where kind = 'dashboard'
  and status = 'published'
  and data is not null
  and published_snapshot is null;

alter table public.agency_documents enable trigger protect_project_document;

-- Same signature and return shape as before, so create or replace is enough.
-- Availability now depends on the snapshot, not on the live row: editing a
-- published dashboard (even in a way that flips its status back to draft)
-- never changes what the link shows until it is published again.
create or replace function public.get_public_dashboard(p_token uuid)
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
  select
    d.published_snapshot ->> 'title',
    d.published_snapshot -> 'config',
    d.published_snapshot -> 'data',
    d.published_at,
    c.name,
    c.logo_url
  from public.agency_documents d
  join public.agency_clients c on c.id = d.client_id
  where d.share_token = p_token
    and d.kind = 'dashboard'
    and d.published_snapshot is not null
$$;

revoke all on function public.get_public_dashboard(uuid) from public, anon, authenticated;
grant execute on function public.get_public_dashboard(uuid) to anon;

comment on column public.agency_documents.published_snapshot is
  'Cópia congelada (title, config, data) da última publicação. É o que o link público exibe; nulo enquanto não publicado.';
comment on column public.agency_documents.content_hash is
  'Impressão digital de title+config+data, mantida por trigger. Comparada com published_hash para detectar alterações não publicadas.';
comment on column public.agency_documents.published_hash is
  'content_hash no momento da última publicação.';
comment on column public.agency_documents.published_since is
  'Início do período da última publicação. Alimenta as mensagens de WhatsApp/e-mail sem enviar o snapshot ao navegador.';
comment on column public.agency_documents.published_until is
  'Fim do período da última publicação.';

commit;
