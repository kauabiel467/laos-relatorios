# Consolidação funcional — 14/09/2026

## Escopo entregue

O workspace moderno é a única experiência montada pelo App Router. A navegação é derivada da URL, sem um segundo estado de seleção de cliente.

- `/projects`: carteira e criação de projeto.
- `/projects/[projectId]`: visão geral do cliente e registros de planejamento históricos.
- `/projects/[projectId]/dashboards`: dashboards desse projeto.
- `/projects/[projectId]/reports`: relatórios atuais e históricos preservados.
- `/projects/[projectId]/integrations`: integração Meta vinculada ao projeto.
- `/projects/[projectId]/timeline` e `/goals`: histórico e metas do mesmo armazenamento existente.
- `/projects/[projectId]/settings` e `/access`: dados e acesso do cliente.
- `/templates`, `/overview`, `/team/settings`: áreas da agência.

As seções de projeto são validadas por uma única lista, em um segmento dinâmico do App Router. Seções desconhecidas retornam 404. Projetos inválidos ou inacessíveis retornam uma tela indisponível, sem revelar sua existência a outro usuário. Integrações, dados e acessos internos exigem participação na equipe também no servidor.

## Implementações canônicas

- `lib/projects/routes.ts`: URLs e redirects compatíveis.
- `lib/projects/access.ts`: sessão e autorização de projeto; usa cliente autenticado e RLS, não service role para leitura de documentos.
- `lib/projects/service.ts`: carga única de carteira, registros e documentos; criação de projeto, registros e progresso de metas.
- `lib/projects/documents.ts`: leitura, cópia, publicação, exclusão de rascunhos e persistência de documentos. Mudanças de período/filtro/KPI invalidam o snapshot, e relatórios publicados não podem ser modificados.
- `lib/projects/meta.ts`: única vinculação/remoção e coleta por projeto, com credenciais protegidas no mapeamento existente.
- `lib/integrations/meta-graph.ts`: transporte Meta com paginação e timeout preservados; versão Graph compartilhada com OAuth.
- `lib/metrics/*`: catálogo, taxonomia, datas e cálculos continuam canônicos. O adaptador legado permanece apenas como compatibilidade de projeção nos testes de reconciliação, não como rota de produção.
- `lib/team/server.ts`: contexto e regras de equipe existentes, agora com seleção explícita do workspace para convites e remoções. Uma equipe fornecida sem participação não concede acesso.

A revisão Next/React manteve a URL como fonte da navegação, cancelamento de cargas obsoletas, breadcrumbs, indicador de projeto/workspace e foco/Escape/Tab no gerenciamento da equipe. A revisão Supabase manteve RLS e consultas autenticadas, com escopo de projeto nos registros e documentos.

## Compatibilidade

`/` preserva parâmetros antigos de projeto, documento, preview, criação e retorno OAuth e redireciona para a rota canônica.
`/traffic` redireciona para dashboards quando um projeto foi informado; sem projeto, leva à carteira. Uma conta Meta não é automaticamente inferida como projeto.
`/operations` mapeia cliente e seção para a área canônica. Links de automações antigas levam à visão geral, que mostra o planejamento preservado sem alegar execução.

`/api/agency` é apenas um alias de GET/POST de `/api/projects`. Não possui coleta ou criação de relatórios independente.
As APIs antigas `/api/meta/dashboard` e `/api/meta/campaign-ads` respondem 410 com indicação de sucessor, porque não estabeleciam um limite de autorização por projeto. Consumidores externos desses endpoints precisam ser adaptados.

Os links atuais de documentos e preview usam a área correta de dashboards/relatórios. O login mantém o link completo. Um documento diretamente solicitado é buscado de forma autenticada mesmo se não estiver nos primeiros itens da listagem.

## Dados e reversão

Nenhuma migration foi criada. Nenhuma tabela, usuário, cliente, relatório, credencial ou histórico foi apagado ou atualizado para esta consolidação. Banco e RLS não foram alterados.

Relatórios em `agency_records` continuam nos registros originais e são acessíveis como documentos históricos somente de leitura, com descrição, contexto, payload original e download JSON. Não há conversão automática de seus bundles antigos para métricas atuais. Relatórios publicados em `agency_documents` mantêm a proteção da aplicação e do trigger existente.

A tabela anterior `relatorios` permanece protegida e server-only conforme a migration 005; não foi exposta nem automaticamente associada a clientes sem um mapeamento confiável de proprietário/projeto.

A reversão consiste em republicar a versão anterior do código, caso autorizada. Não há rollback de dados ou RLS necessário. Os componentes legados removidos são recuperáveis pelo histórico do Git. Nenhum commit, push ou deploy desta etapa foi executado.

## Validação

- TypeScript (`tsc --noEmit`): passou.
- ESLint com zero warnings: passou.
- `tests/projects-model.cjs`: passou.
- `tests/metrics-engine.cjs`: passou, incluindo fixture Meta executada pelos adaptadores moderno e legado.
- `tests/projects-architecture.cjs`: passou; rotas/redirects, acesso de cliente/equipe, workspace selecionado/inacessível, confirmação de falha do provedor de convite, snapshots e imutabilidade, conversão sem alterar origem, filtros de documento e transporte paginado Meta.
- `tests/agency-rls.sql`: passou no Supabase existente, dentro de transação com rollback. Corrigido um delimitador SQL inválido na fixture.
- `tests/project-documents-rls.sql`: passou no Supabase existente, dentro de transação com rollback.
- Build de produção: passou.
- HTTP no build local: redirects 307 de raiz/operations/traffic, seção desconhecida 404, APIs aposentadas 410 e link de documento preservado pelo login: passaram.
- `git diff --check`: passou.

Os testes SQL não deixaram fixtures persistidas. O servidor local temporário foi encerrado.

## Limitações e teste manual

Não foi exercitada uma sessão autenticada de gestor/cliente no navegador nem realizada revisão visual desktop/mobile desta etapa. OAuth/coleta Meta real continuam dependendo de uma sessão e conta autorizadas. Não há nova integração, envio automático, agendamento ou automação funcional implementada neste workflow.

Relatórios legados têm visualização de conteúdo original/JSON; não foram refeitos como PDFs atuais. O armazenamento antigo `relatorios` ainda exige mapeamento explícito antes de uma importação segura.

As listagens continuam limitadas a 500 documentos e 2.000 registros visíveis; a carteira está sujeita ao limite da Data API. Paginação da carteira completa permanece pendente. Links diretos de documentos/projetos têm busca com escopo explícito para não depender apenas desses limites.

Envio de convites depende da configuração existente de SUPABASE_SECRET_KEY e SMTP do Supabase. Falha retornada pelo provedor não é declarada como convite enviado. Nenhuma credencial nova é necessária para as rotas.

Teste manual após executar `npm run dev`:

1. Entre como gestor e abra `/projects`; selecione ou crie um cliente.
2. Navegue por dashboards, relatórios, integrações, metas e timeline, verificando URLs e breadcrumbs.
3. Salve/recarregue um documento; altere filtros e confirme invalidação/atualização do snapshot.
4. Abra preview/compartilhamento em nova aba e confirme que o login mantém o documento.
5. Abra um relatório publicado e confirme que edição/exclusão não são permitidas.
6. Abra relatórios históricos em `/reports` e confirme que o conteúdo original permanece somente de leitura.
7. Em `/team/settings`, selecione cada workspace autorizado e confira a equipe correta.
8. Entre como cliente: somente projetos e documentos publicados autorizados devem ser visíveis; rotas internas de integração/configuração/acesso não devem abrir.
9. Teste links antigos de `/`, `/traffic` e `/operations`, IDs inválidos e outro projeto inacessível.
10. Repita navegação, modal da equipe e documentos em largura móvel e somente pelo teclado.

## Arquivos

- Alterado: `README.md`
- Alterado: `app/api/agency/route.ts`
- Alterado: `app/api/integrations/meta/start/route.ts`
- Alterado: `app/api/meta/campaign-ads/route.ts`
- Alterado: `app/api/meta/dashboard/route.ts`
- Alterado: `app/api/projects/route.ts`
- Alterado: `app/api/team/context/route.ts`
- Alterado: `app/api/team/invite/route.ts`
- Alterado: `app/api/team/members/remove/route.ts`
- Alterado: `app/operations/page.tsx`
- Alterado: `app/page.tsx`
- Alterado: `app/traffic/page.tsx`
- Removido (código legado): `components/agency/workspace.css`
- Removido (código legado): `components/agency/workspace.tsx`
- Removido (código legado): `components/dashboard/ai-panel.tsx`
- Removido (código legado): `components/dashboard/campaign-drawer.tsx`
- Removido (código legado): `components/dashboard/campaigns-table.tsx`
- Removido (código legado): `components/dashboard/cardapio-modal.tsx`
- Removido (código legado): `components/dashboard/config-modal.tsx`
- Removido (código legado): `components/dashboard/dashboard-app.tsx`
- Removido (código legado): `components/dashboard/header-bar.tsx`
- Removido (código legado): `components/dashboard/media-metrics-section.tsx`
- Removido (código legado): `components/dashboard/meta-integration-card.tsx`
- Removido (código legado): `components/dashboard/meta-integration-modal.tsx`
- Removido (código legado): `components/dashboard/meta-visuals-section.tsx`
- Removido (código legado): `components/dashboard/metric-card.tsx`
- Removido (código legado): `components/dashboard/quick-insights-section.tsx`
- Removido (código legado): `components/dashboard/section-title.tsx`
- Removido (código legado): `components/dashboard/tabs-nav.tsx`
- Alterado: `components/dashboard/team-settings-modal.tsx`
- Alterado: `components/projects/analysis-view.tsx`
- Alterado: `components/projects/projects.css`
- Alterado: `components/projects/workspace.tsx`
- Alterado: `lib/integrations/meta-dashboard.ts`
- Alterado: `lib/integrations/meta-oauth.ts`
- Alterado: `lib/projects/meta.ts`
- Alterado: `lib/team/server.ts`
- Alterado: `package.json`
- Alterado: `tests/agency-rls.sql`
- Alterado: `tests/metrics-engine.cjs`
- Criado: `app/_components/workspace-page.tsx`
- Criado: `app/overview/page.tsx`
- Criado: `app/projects/[projectId]/[section]/page.tsx`
- Criado: `app/projects/[projectId]/not-found.tsx`
- Criado: `app/projects/[projectId]/page.tsx`
- Criado: `app/projects/page.tsx`
- Criado: `app/team/settings/page.tsx`
- Criado: `app/templates/page.tsx`
- Criado: `components/projects/preserved-report.tsx`
- Criado: `lib/integrations/meta-graph.ts`
- Criado: `lib/projects/access.ts`
- Criado: `lib/projects/documents.ts`
- Criado: `lib/projects/routes.ts`
- Criado: `lib/projects/service.ts`
- Criado: `tests/projects-architecture.cjs`
- Criado: `docs/architecture-workflow.md`

