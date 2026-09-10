# Auditoria da plataforma LAOS — 10 de setembro de 2026

## Resumo executivo

O repositório já contém uma primeira tentativa relevante da experiência por projeto: carteira pesquisável, criação de projeto em duas etapas, catálogo de integrações, vínculo de uma conta Meta por projeto, templates, dashboards, relatórios imutáveis depois da publicação, visão autenticada do cliente, metas manuais e linha do tempo. Essa base deve ser aproveitada.

Ela ainda não constitui a plataforma descrita no escopo completo. Existem duas experiências concorrentes (`/` para projetos e `/traffic`/`/operations` para o produto legado), componentes muito grandes, permissões de equipe pouco granulares, templates armazenados como documentos de um cliente, coleta Meta síncrona e funcionalidades de automação/compartilhamento que são apenas preparação visual. Cardápio e marketplace não têm fornecedor nem API definidos.

O primeiro marco recomendado é um único percurso confiável: projeto → Meta → template → seleção de período/campanhas → dados reais → edição → visão do cliente → relatório preservado → link/PDF. Automações e novos canais devem vir depois dessa base.

## Estado observado

### Produção e dados

- Aplicação: Next.js 15, React 19, TypeScript e App Router, publicada na Vercel.
- Banco/Auth: projeto Supabase original em `sa-east-1`, estado `ACTIVE_HEALTHY` durante a auditoria.
- Dados preservados: 4 usuários, 2 equipes, 3 membros, 2 relatórios legados e 5 sessões Meta. A carteira nova ainda tem 0 projetos e 0 documentos.
- Migrações remotas 001–005 correspondem às migrações versionadas no repositório; a 005 foi aplicada durante esta auditoria.
- O deployment de produção atual respondeu sem erro 5xx no recorte mais recente verificado.

### Diagnóstico do 504

Nos logs históricos da Vercel apareceram falhas de middleware com `fetch failed`, `ENOTFOUND` para o domínio do Supabase e execuções encerradas por não retornarem resposta inicial em 25 segundos. Isso sustenta uma falha de DNS/conectividade entre a função e o Supabase naquele período; não sustenta, sozinho, a hipótese de limite do banco.

O middleware fazia uma validação remota de usuário em praticamente todas as rotas. A correção desta etapa troca essa validação por `getClaims()`, que pode validar JWTs assimétricos com chaves em cache, e limita a chamada do middleware a 4 segundos. Clientes Supabase usados nas páginas e APIs passam a ter limite de 8 segundos. Rotas protegidas continuam validando autenticação e falham fechadas.

### Segurança e banco

Achados prioritários:

1. `public.relatorios` tinha uma policy `ALL` com `true` e privilégios completos para `anon` e `authenticated`. Os dois registros legados podiam ser lidos e alterados diretamente. A migration 005 preserva as linhas e torna a tabela acessível apenas pelo servidor até que cada registro seja associado a um usuário/equipe/projeto.
2. Tokens Meta são armazenados na tabela server-only `meta_integration_sessions`, sem acesso direto de `anon`/`authenticated`, mas ainda em texto puro. Uma etapa posterior deve usar criptografia de aplicação ou Supabase Vault e planejar rotação sem interromper as conexões.
3. Todo membro da agência satisfaz `agency_staff`, então `operator`, `manager` e `owner` têm praticamente os mesmos poderes sobre projetos e documentos. A matriz de autorização precisa ser formalizada antes do convite de clientes e da ampliação da equipe.
4. O convite de equipe tem aceitação automática ao encontrar o e-mail confirmado. O acesso de cliente, porém, exige que a conta já exista e não entrega um convite real para novos usuários.
5. Links públicos com senha, revogação, expiração e auditoria ainda não existem. A visão atual exige autenticação.
6. O advisor indicou oito chaves estrangeiras sem índice. A migration 005 adiciona todos os índices sem remover dados.

## Avaliação funcional por domínio

| Domínio | Situação | Evidência e lacuna principal |
| --- | --- | --- |
| Projetos | Parcial | Carteira, busca, ordenação e criação existem. Idioma, datas e números são exibidos, mas não persistidos; logo é URL, sem upload. |
| Meta OAuth | Parcial avançado | Autorização, lista de contas e vínculo por projeto existem. Falta teste ponta a ponta com conta real, paginação da lista inicial de contas, diagnóstico proativo de expiração e criptografia do token. |
| Coleta Meta | Parcial avançado | Período, comparação, campanhas históricas, métricas e algumas dimensões existem. A coleta dispara muitas consultas paralelas e prévias N+1 dentro da requisição; pode exceder orçamento/rate limit. |
| Templates | Parcial | Estruturas realmente diferem por objetivo e podem ser reutilizadas. O modelo de propriedade ainda vincula o template ao cliente de origem em vez de à agência. |
| Editor | Parcial | Métricas, blocos e análise podem ser reordenados/editados. Tabelas, colunas, gráficos e seções ainda não têm composição plenamente flexível. |
| Dashboard | Parcial | Período editável, refresh manual e refresh de 5 minutos com página aberta. Não existe sincronização automática em background. |
| Relatório | Parcial | Snapshot e imutabilidade após publicação existem. PDF usa impressão do navegador e precisa de renderização/validação dedicada. |
| Compartilhamento | Parcial | Link autenticado, impressão e composição de WhatsApp/e-mail. Não há link público protegido, envio efetivo, revogação ou contagem confiável. |
| Metas/linha do tempo | Parcial | Registros manuais persistidos. Realizado integrado, trilha automática de eventos e auditoria completa faltam. |
| Alertas/automações | Não funcional | Há configuração/planejamento salvo, sem scheduler, coleta, geração, envio, idempotência ou histórico de execução. |
| Overview | Parcial | Há consolidação inicial, mas ainda não é uma fila operacional robusta nem trata moedas incompatíveis. |
| Cardápio/iFood | Não iniciado | Depende de fornecedor, documentação oficial, aprovação e credenciais. Não deve aparecer como conectado antes disso. |

## Riscos técnicos que orientam a reestruturação

- `/`, `/traffic` e `/operations` mantêm modelos de produto e cálculo Meta duplicados.
- `components/projects/workspace.tsx` e `components/agency/workspace.tsx` concentram estado, navegação e mutações demais; isso aumenta regressões e dificulta testes.
- A listagem carrega até 500 documentos e a visão da agência até 2.000 registros sem paginação por projeto.
- A geração consulta período atual, comparação, série diária, campanhas, conjuntos, anúncios, plataforma e audiência na mesma função; depois consulta criativos individualmente. A operação deve virar job idempotente com cache por conta/período/filtro.
- A versão da Graph API está fixa em `v22.0`; versões e permissões precisam de política de atualização e testes antes do prazo de descontinuação.
- Não há tipos gerados do schema Supabase, logs estruturados por execução nem monitoramento de freshness das integrações.

## Plano de entrega proposto

### Marco 0 — proteção e observabilidade

- Aplicar a migration 005, confirmar contagens preservadas e executar advisors/RLS.
- Publicar os limites de timeout e monitorar middleware/Supabase.
- Adicionar eventos estruturados de autenticação, coleta e documento sem registrar tokens.

### Marco 1 — fundação por projeto

- Consolidar a navegação em rotas `/projects/[projectId]/...` e retirar a duplicação funcional gradualmente.
- Persistir perfil do negócio, locale, formato de data/número e logo em storage.
- Definir papéis e permissões por ação; implementar convites reais de agência e cliente.
- Separar templates de documentos e tornar template propriedade da equipe, nunca do cliente-fonte.

### Marco 2 — Meta ponta a ponta

- Paginar contas, campanhas e insights; validar token/escopos e estados de reconexão.
- Criptografar credenciais e impedir desconexão global acidental de vários projetos.
- Criar job de sincronização idempotente, cache de dados normalizados e histórico de execução.
- Validar métricas/eventos por objetivo e executar um teste real com conta autorizada.

### Marco 3 — composição e entrega

- Editor por blocos com schema versionado, tabelas/colunas e compatibilidade de template.
- Dashboard recorrente sobre dados sincronizados e relatório como snapshot imutável.
- Visualização fiel do cliente, link revogável/senha/expiração e PDF renderizado no servidor.
- Registrar visualizações e ações sem confundir composição com envio concluído.

### Marco 4 — operação da agência

- Metas integradas, alertas separados entre desempenho e coleta, timeline/audit log.
- Overview orientado a exceções, respeitando moeda, fuso e tipo de indicador.
- Automação semanal/mensal com scheduler, fila, idempotência, provedor de e-mail e histórico.

### Marco 5 — delivery e marketplaces

- Selecionar o fornecedor de cardápio depois de confirmar API oficial, acesso comercial, limites e webhooks.
- Implementar adaptadores normalizados por fonte e preservar a origem de receita. Nunca somar receita Meta, cardápio e marketplace como se fossem valores exclusivos.

## Critério de aceite do próximo marco funcional

O marco Meta só deve ser considerado concluído quando uma conta real completar: criar projeto → autorizar Meta → pesquisar/selecionar conta → escolher template → período/comparação/campanhas → coletar sem dados fictícios → editar → visualizar como cliente → publicar snapshot → compartilhar com controle de acesso. O teste deve incluir token expirado, ausência de dados, campanha pausada no período, falha temporária e isolamento entre dois projetos.
