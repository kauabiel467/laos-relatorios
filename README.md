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
npm run build
```

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
- `CARDAPIO_API_URL`
- `CARDAPIO_API_TOKEN`

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
