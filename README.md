# LAOS Dashboard Next

Base profissional em `Next.js + TypeScript + Tailwind CSS` preparada para evoluir o dashboard de analise da Laos.

## Stack

- Next.js App Router
- TypeScript
- Tailwind CSS
- Supabase SSR
- Estrutura preparada para Vercel
- CI para GitHub Actions

## Scripts

```bash
npm install
npm run dev
npm run lint
npm run typecheck
npm test
npm run build
```

## Testes de RLS (SQL)

`tests/agency-rls.sql` e `tests/project-documents-rls.sql` validam as políticas de
RLS e as RPCs security-definer diretamente no Postgres, usando `auth.uid()` e os
papéis `authenticated`/`anon`/`service_role`. Isso só existe de verdade numa
instância Supabase (stack local via `supabase start`, ou um projeto de teste
descartável) — um container `postgres:` genérico no CI não replica esse ambiente
com fidelidade suficiente para um teste de segurança, então eles não rodam no CI
por enquanto (ver comentário em `.github/workflows/ci.yml`). Para rodar localmente:

```bash
supabase start
for f in supabase/migrations/*.sql; do
  psql "$(supabase status -o json | jq -r '.DB_URL')" -f "$f"
done
psql "$(supabase status -o json | jq -r '.DB_URL')" -f tests/agency-rls.sql
psql "$(supabase status -o json | jq -r '.DB_URL')" -f tests/project-documents-rls.sql
```

Cada arquivo roda dentro de uma transação (`begin`/`rollback`, sem deixar
fixtures no banco) e usa `raise exception` para falhar alto ao primeiro
problema — o `psql` retorna código de saída não-zero nesse caso. Sem erro, a
última linha impressa é `PASS: ...`.

## Variaveis de ambiente

Copie `.env.example` para `.env.local` e preencha:

```bash
cp .env.example .env.local
```

Principais variaveis:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SECRET_KEY`
- `OPENAI_API_KEY`
- `META_SYSTEM_USER_TOKEN`
- `IFOOD_CLIENT_ID`
- `IFOOD_CLIENT_SECRET` (somente no servidor)
- `IFOOD_OAUTH_STATE_SECRET` (segredo aleatório com pelo menos 32 caracteres)
- `IFOOD_TOKEN_ENCRYPTION_KEY` (chave aleatória distinta, com pelo menos 32 caracteres)
- `CARDAPIO_API_URL`
- `CARDAPIO_API_TOKEN`

O início da autorização oficial do iFood está disponível no catálogo de
integrações. O LAOS gera o código de vinculação, mantém o
`authorizationCodeVerifier` cifrado em cookie `HttpOnly`, troca o código de
autorização no servidor e persiste access/refresh tokens cifrados em uma tabela
sem acesso para os papéis do navegador. A coleta de pedidos/Analytics ainda não
faz parte deste fluxo. `IFOOD_API_BASE_URL` é opcional e, em produção, deve
permanecer no endpoint oficial `https://merchant-api.ifood.com.br`.

Compatibilidade legada:

- `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`

## Estrutura

- `app/`: rotas App Router e APIs
- `components/`: componentes de interface
- `lib/config/`: configuracoes centrais
- `lib/supabase/`: clientes e middleware SSR
- `lib/integrations/`: adaptadores de integracoes externas
- `lib/mocks/`: dados de desenvolvimento
- `.github/workflows/`: pipeline de validacao

## Deploy

Projeto pronto para deploy futuro na Vercel com import direto do repositorio.

## Workspace canônico

A entrada é `/projects`. Dashboards, relatórios, integrações, metas e histórico pertencem a `/projects/[projectId]`.
Templates, overview e equipe ficam em `/templates`, `/overview` e `/team/settings`.
As rotas antigas apenas redirecionam; os dados históricos permanecem preservados.

Veja [a documentação da consolidação](docs/architecture-workflow.md) para compatibilidade, arquivos alterados, testes e limitações.
O fluxo de criação, acessos, integrações e finalização está detalhado em
[Configuração de projetos](docs/project-setup-workflow.md).
