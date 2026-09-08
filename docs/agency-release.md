# Central LAOS — primeira evolução

A entrada autenticada agora abre a carteira da agência, com busca de clientes e navegação por negócio. A análise detalhada de tráfego continua em `/traffic` e exige participação em uma equipe.

## Disponível
- Clientes vinculados à equipe, segmento, unidade e contato.
- Portal de leitura para clientes autorizados por proprietário ou gerente, com conta confirmada.
- Metas com prazo, realizado manual e alertas de prazo/limite na tela.
- Histórico com visibilidade interna ou compartilhada.
- Rascunhos de relatório com cópia da atualização Meta e análise do gestor; publicação imutável e impressão/PDF.
- Vinculação e atualização manual da Meta por cliente. Sessões antigas precisam ser reconectadas para vincular o responsável.
- Planejamento de automações pausadas.

## Limites desta entrega
- Não há envio automático de relatórios ou alertas por e-mail/WhatsApp.
- Cardápio e marketplace dependem da identificação do fornecedor e acesso autorizado à API oficial.
- Não inclui IA, gestão de orçamento de campanha, edição de anúncios ou atribuição entre canais.
- A carteira inicia vazia. Não foram inferidos clientes a partir dos nomes das contas Meta.
- Relatórios antigos continuam preservados na tabela original, sem importação automática para a carteira. Sua política de acesso antiga permanece: a mudança foi bloqueada pela revisão automática até mapear e testar a propriedade dos registros.
- A migração para o segundo projeto Supabase não foi executada. Esta entrega usa o projeto original restaurado.
- Consulta inicial limitada aos 2.000 registros mais recentes visíveis; exige paginação para carteiras maiores.

## Validação
- Build de produção, TypeScript e ESLint.
- Auditoria das dependências sem vulnerabilidades conhecidas após correções compatíveis.
- `tests/agency-rls.sql`: testes transacionais de isolamento, leitura do cliente, bloqueio de escrita, criação atômica de equipe, proteção contra apropriação de equipe, rascunhos, publicação imutável e acesso anônimo. Todos os dados de teste são revertidos.
- As tabelas novas foram adicionadas pelas migrations 002 e 003. Não apagar essas tabelas para reverter interface: o aplicativo anterior pode ser republicado preservando os registros.
