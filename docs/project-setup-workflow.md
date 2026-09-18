# Configuração de projetos

Este documento descreve o fluxo canônico de criação e configuração de um
projeto na LAOS. Um projeto representa um cliente ou negócio. A autorização
pessoal usada no OAuth da Meta e a conta de anúncios vinculada ao projeto são
conceitos diferentes.

## Fluxo em quatro etapas

### 1. Dados do projeto

O primeiro salvamento cria o projeto e inicia uma configuração retomável. Os
campos persistidos em `agency_clients` são:

| Campo na interface | Coluna | Regra |
| --- | --- | --- |
| Nome | `name` | Obrigatório, de 2 a 120 caracteres |
| Segmento | `segment` | Obrigatório, de 2 a 80 caracteres |
| Unidade | `unit` | Obrigatório, de 2 a 100 caracteres |
| E-mail de contato | `contact_email` | Opcional; quando informado, deve ser um e-mail válido |
| Logo | `logo_url` | Opcional; nesta versão é uma URL HTTPS, não um upload de arquivo |
| Idioma | `language` | `pt-BR`, `en-US` ou `es-ES` |
| Moeda | `currency` | `BRL`, `USD`, `EUR`, `ARS` ou `MXN` |
| Formato de data | `date_format` | `DD/MM/YYYY`, `MM/DD/YYYY` ou `YYYY-MM-DD` |
| Separador decimal | `decimal_separator` | Vírgula ou ponto |
| Separador de milhar | `thousands_separator` | Ponto ou vírgula, diferente do separador decimal |
| Fuso horário | `timezone` | Um fuso IANA oferecido pelo formulário |

As mesmas regras centrais são usadas no formulário e na API. Restrições do
banco protegem os domínios fechados. O e-mail de contato e a logo podem ficar
em branco e aparecem como recomendações, não como falso erro de conclusão.
Todas as preferências podem ser alteradas depois em **Dados do projeto**.

Projetos anteriores à migration 007 recebem os padrões brasileiros e são
marcados como já configurados. Isso evita bloquear clientes e documentos
existentes. Um projeto novo é criado com a etapa 1 já persistida e continua na
etapa 2.

### 2. Equipe e acesso

Há dois escopos de acesso distintos:

- **Equipe interna:** os papéis `owner`, `manager` e `operator` pertencem à
  equipe e, portanto, valem para os projetos dessa equipe. A edição de membros
  continua centralizada em `/team/settings`.
- **Cliente convidado:** o acesso pertence ao projeto. Nesta versão há somente
  o papel real `viewer` (Cliente — visualização). Não são exibidos papéis sem
  diferença efetiva de permissão.

Permissões efetivas:

| Papel | Configurar projeto e testar Meta | Convidar/revogar cliente | Remover vínculo Meta | Ver documentos publicados autorizados |
| --- | --- | --- | --- | --- |
| Dono | Sim | Sim | Sim | Sim |
| Gerente | Sim | Sim | Sim | Sim |
| Gestor (`operator`) | Sim | Não | Não | Sim |
| Cliente (`viewer`) | Não | Não | Não | Sim |

Se o e-mail convidado já corresponde a uma conta confirmada, o acesso é
liberado imediatamente. Caso contrário, `agency_client_invitations` mantém o
convite como `pending`. Na primeira entrada com aquele e-mail confirmado, a
função `agency_accept_client_invitations()` cria o acesso e marca o convite
como aceito. Cancelar um convite altera seu estado para `revoked`; revogar um
acesso remove o vínculo do usuário com o projeto.

O registro do convite e o envio de e-mail são resultados separados. Um convite
pode estar persistido mesmo quando o provedor de e-mail falha; a interface deve
mostrar essa diferença, sem afirmar que houve envio.

### 3. Integrações

O catálogo possui busca por nome e descrição. Os badges possuem significado
explícito:

- **Disponível:** há um fluxo acionável para conectar.
- **Conectado:** o projeto possui uma conta vinculada e o último teste terminou
  com sucesso.
- **Beta:** a integração funciona, mas ainda está em maturação.
- **Em breve:** existe no roteiro, porém não pode ser conectada.
- **Indisponível:** depende de fornecedor, credencial ou acesso comercial ainda
  não disponível para o produto.

Nesta versão, somente **Meta Ads** é conectável e também recebe o badge
**Beta**. Instagram orgânico, Facebook orgânico, Google Ads, GA4 e Perfil da
Empresa no Google ficam como **Em breve**. iFood e cardápio digital ficam como
**Indisponível**, com a dependência explicada. Esses cartões não executam uma
ação decorativa.

O fluxo Meta é:

1. O gestor inicia o OAuth oficial e autoriza o usuário pessoal da Meta.
2. O servidor pagina e lista as contas de anúncios acessíveis por essa
   autorização.
3. O gestor pesquisa e seleciona a conta correta do cliente.
4. Antes do vínculo, o servidor consulta os metadados da conta e executa uma
   leitura mínima de Insights. Uma resposta vazia é válida; uma falha de token
   ou permissão não é convertida em dado fictício.
5. O vínculo projeto/conta é salvo inicialmente como `untested` em
   `agency_meta_connections` e a identificação compatível é atualizada em
   `agency_clients` na mesma transação. Somente a camada server-side, após o
   teste Graph, pode promover a saúde para `connected`; os metadados de saúde
   não são aceitos da chamada autenticada.
6. Testes posteriores atualizam a saúde da conexão e a data da última
   verificação.

Uma mesma autorização Meta pode listar contas usadas por projetos diferentes.
Cada projeto mantém apenas o seu `account_id`; a coleta resolve as credenciais
pelo vínculo protegido e não infere a conta a partir do primeiro resultado.
Fechar a sessão do navegador não apaga vínculos de outros projetos.

Estados persistidos de saúde:

| Estado | Significado |
| --- | --- |
| `untested` | Vínculo legado migrado; exige teste ao vivo |
| `connected` | Conta e leitura de Insights validadas no último teste |
| `reauth_required` | Token expirado ou autorização revogada |
| `temporarily_unavailable` | Falha transitória ou limite temporário da Meta |
| `error` | Falha não transitória, por exemplo permissão insuficiente |

`last_checked_at`, `last_success_at`, `last_error_category` e
`last_error_message` permitem distinguir sucesso, falha temporária e
reconexão necessária. Desvincular uma conta preserva dashboards e relatórios,
mas reabre a configuração na etapa de integrações.

### 4. Finalização

A revisão apresenta:

- dados e preferências do projeto;
- quantidade de membros internos, clientes ativos e convites pendentes;
- nome, ID e saúde da conta Meta vinculada;
- campos opcionais ainda não preenchidos.

Os botões **Criar dashboard** e **Criar relatório** só ficam disponíveis quando
os dados obrigatórios são válidos e a conexão Meta está em `connected`. Ao
concluir, `onboarding_step` fica em 4 e `onboarding_completed_at` registra o
momento. O usuário segue para o seletor de template do documento escolhido; a
conclusão do onboarding não gera métricas nem relatório por conta própria.

## Persistência e segurança

A migration `007_project_configuration_workflow.sql` é aditiva:

- acrescenta preferências e progresso a `agency_clients`;
- enriquece `agency_client_access` com e-mail, papel, autoria e data;
- cria `agency_client_invitations` com RLS habilitada;
- acrescenta metadados sanitizados e saúde a
  `agency_meta_connections`;
- cria funções atômicas para convite, aceite, revogação, vínculo e remoção da
  Meta.

Usuários autenticados só leem convites dos projetos em cuja equipe participam.
Convite e revogação exigem dono ou gerente. O mapeamento Meta continua sem
acesso direto do cliente, e tokens não são enviados para o navegador. O fluxo
não altera tabelas, políticas ou triggers de documentos: relatórios publicados
continuam imutáveis.

As RPCs `SECURITY DEFINER` deste fluxo são deliberadamente executáveis por
`authenticated`, pois são a fronteira de escrita usada pela aplicação. Cada
uma valida `auth.uid()`, o projeto e o papel autorizado, usa `search_path`
vazio e revoga execução de `PUBLIC` e `anon`. Por isso o advisor do Supabase
pode listá-las como aviso genérico; o comportamento esperado deve continuar
coberto pelos testes RLS. A proteção contra senhas vazadas é uma configuração
separada do Supabase Auth e deve ser habilitada no painel quando disponível.

## Dependências externas

### Supabase e convites

São necessários `NEXT_PUBLIC_SUPABASE_URL`, uma chave pública compatível e
`SUPABASE_SECRET_KEY` (ou a variável legada equivalente apenas durante a
transição) no servidor. O envio para destinatários arbitrários em produção
também exige SMTP próprio configurado no Supabase Auth. Sem a chave de servidor
ou sem SMTP válido, o convite permanece salvo e a aplicação informa que o
e-mail não foi confirmado como enviado.

O URL de callback de autenticação deve aceitar
`<NEXT_PUBLIC_APP_URL>/auth/callback`.

### Meta Ads

São necessários `META_APP_ID`, `META_APP_SECRET` e `NEXT_PUBLIC_APP_URL`. No
aplicativo da Meta, deve estar autorizado o callback
`<NEXT_PUBLIC_APP_URL>/api/integrations/meta/callback`, com as permissões
`ads_read` e `business_management` aprovadas para o uso pretendido. Usuário,
negócio e conta de anúncios precisam conceder acesso real; a aplicação não
contorna revisão, expiração de token ou permissões da Meta.

Nenhuma credencial de iFood, cardápio digital ou Google torna esses cartões
funcionais nesta versão, pois seus adaptadores ainda não foram implementados.

## Recuperação e reversibilidade

O progresso é salvo a cada avanço e pode ser retomado pelo parâmetro
`onboarding`. Falhas de rede ou provedor mantêm a etapa anterior e oferecem nova
tentativa; uma falha de teste da Meta registra o estado correspondente sem
inventar sucesso.

A reversão preferida é publicar a versão anterior da aplicação. O código
anterior ignora as colunas e a tabela adicionadas, portanto dados existentes
continuam preservados. Não existe rollback destrutivo automático para a
migration 007: remover `agency_client_invitations` apagaria convites pendentes e
remover colunas apagaria preferências e histórico de saúde. Se uma reversão de
schema for indispensável, primeiro exporte esses registros, restaure a assinatura
anterior de `agency_grant_access` e só então remova funções, políticas, tabela,
constraints e colunas em uma migration separada e revisada. Não reverta apagando
clientes, acessos, documentos, sessões Meta ou relatórios.

## Como validar

Antes de publicar:

```bash
npm run typecheck
npm run lint
npm test
npm run build
```

Execute também os testes RLS em transação com `rollback`, depois de aplicar a
migration no ambiente de validação. Verifique no mínimo:

1. dono e gerente convidam, cancelam e revogam; gestor e cliente recebem erro;
2. convite para usuário inexistente fica pendente e é aceito somente pelo e-mail
   confirmado correspondente;
3. um cliente não lê convites, configurações internas nem mapeamento Meta de
   outro projeto;
4. um vínculo Meta legado aparece como `untested`, nunca como sucesso;
5. conexão válida, Insights sem dados, permissão insuficiente, token expirado e
   falha transitória geram estados distintos;
6. a conta selecionada pertence à autorização e ao projeto correto;
7. recarregar cada etapa preserva dados e progresso;
8. a finalização bloqueia sem conexão testada e leva ao primeiro documento com
   conexão válida;
9. edição posterior preserva os novos valores;
10. relatórios publicados continuam sem edição ou exclusão.

Faça a verificação manual em desktop, tablet e celular, além de percorrer
formulários, progresso, modal de contas, retry e ações apenas pelo teclado.
