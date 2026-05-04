-- Execute este SQL no Supabase → SQL Editor

create table relatorios (
  id bigserial primary key,
  cliente text not null,
  mes text not null,
  gestor text not null,
  dados jsonb not null,
  analise jsonb,
  slides jsonb,
  criado_em timestamptz default now()
);

-- Permitir acesso público (sem autenticação por enquanto)
alter table relatorios enable row level security;

create policy "Acesso total" on relatorios
  for all using (true) with check (true);
