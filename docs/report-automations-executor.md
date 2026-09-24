# Automações de relatório — executor, agendador e WhatsApp

Como o envio automático funciona, o que precisa ser configurado e como testar.

## Fluxo de uma execução

Um único executor (`lib/automations/executor.ts`) atende o agendador, o "Executar agora", o
"Enviar teste" e o "Tentar novamente". O que muda entre eles é só o gatilho
(`trigger_type`: `scheduled`, `manual`, `test`).

1. **Planejar**: período exato (seg–qui, sex–dom, seg–dom) e comparação (mesmo bloco, 7 dias antes).
   Execução agendada usa o instante em que *venceu* (uma execução atrasada ainda reporta a semana certa).
2. **Registrar e travar**: insere a execução (slot único + chave de idempotência) e faz `scheduled → running` de forma atômica.
3. **Validar**: provedor configurado, destinatário válido (DDI/DDD), dashboard do projeto.
4. **Coletar** com o mesmo coletor do editor (`collectAnalysis`), para o período exato.
5. **Validar dados**: período correto, há números. Coleta vazia/falha **nunca vira zeros**: a execução falha com erro legível.
6. **Gerar a mensagem** com os modelos de "Copiar relatório".
7. **Congelar o relatório** (se ativado): snapshot próprio + token próprio, gravados **antes** do envio.
8. **Enviar** pelo provedor e **registrar** o resultado (id do provedor, status, erro).

## Agendador (Vercel Cron)

Endpoint único: `GET|POST /api/cron/report-automations`, protegido por `CRON_SECRET`
(header `Authorization: Bearer <CRON_SECRET>`, comparado em tempo constante; sem segredo configurado responde 503).
Cada chamada: fecha execuções travadas → executa o que venceu (`next_run_at <= agora`, só automações ativas) →
refaz falhas transitórias elegíveis. Chamar duas vezes, ou de dois lugares ao mesmo tempo, é seguro.

### ⚠️ Limitação conhecida: frequência do cron da Vercel

O plano do projeto não pôde ser lido pela API. O time é pessoal e não tem cobranças, o que aponta para **Hobby**.

| Plano | Cron |
| --- | --- |
| Hobby | no máximo 1 execução por dia, sem hora exata (dispara dentro da hora agendada); expressões mais frequentes **quebram o deploy** |
| Pro | até 1 por minuto |

As automações têm dia **e horário** próprios (ex.: segunda 09:00), o que pede um tick de poucos minutos.
Por isso **`vercel.json` não tem nenhum cron ainda**. Nada foi inventado: escolha uma das opções.

* **Plano Pro**: adicionar ao `vercel.json` e configurar `CRON_SECRET` (a Vercel envia o header sozinha):
  ```json
  { "crons": [{ "path": "/api/cron/report-automations", "schedule": "*/5 * * * *" }] }
  ```
* **Continuar no Hobby**: um disparador externo (ex.: GitHub Actions `schedule`, cron-job.org) chamando o endpoint
  a cada 5–10 min com o header `Authorization: Bearer <CRON_SECRET>`. O endpoint é o mesmo.
* Um cron diário no Hobby *funcionaria* com atraso de até um dia; o agendador aceita até 36 h de atraso
  (depois registra `skipped`/`missed_window` e não envia).

Sem nenhum disparador, só "Executar agora" e "Enviar teste" funcionam.

## WhatsApp

Provedor único hoje: **WhatsApp Cloud API (oficial da Meta)**, atrás da interface `WhatsAppProvider`
(`lib/whatsapp/provider.ts`, `sendWhatsAppMessage`). Nenhum outro código fala com o WhatsApp.

Variáveis (somente servidor, nunca `NEXT_PUBLIC_`):

| Variável | Obrigatória | Descrição |
| --- | --- | --- |
| `CRON_SECRET` | sim (para o agendador) | segredo do endpoint do agendador |
| `WHATSAPP_CLOUD_ACCESS_TOKEN` | sim (para enviar) | token de acesso da Cloud API |
| `WHATSAPP_CLOUD_PHONE_NUMBER_ID` | sim (para enviar) | ID do número de telefone da conta WhatsApp Business |
| `WHATSAPP_CLOUD_API_VERSION` | não | padrão `v22.0` |

Sem as credenciais, a execução falha com "O envio por WhatsApp ainda não foi configurado" (nada é enviado, nada é coletado).

**Regra da plataforma:** mensagem de texto livre só é entregue se o cliente falou com o número da agência nas últimas
24 h. Fora dessa janela o WhatsApp exige um *modelo (template) aprovado*; isto ainda não foi implementado e
o erro aparece no histórico como "fora da janela de 24 horas". Grupos não têm suporte na API oficial: automações
para grupo falham com `recipient_unsupported`.

## Idempotência e concorrência

* Slot único `(automation_id, scheduled_for, attempt)` + `idempotency_key` único por envio pretendido.
* Agendada: `scheduled:<automação>:<vencimento>:a<n>`. Manual/teste: chave por clique. Retry: `retry:<execução>`.
* O claim `scheduled → running` só devolve a linha para um executor.
* `next_run_at` avança assim que o slot é reservado (compare-and-set: uma edição feita durante a execução não é sobrescrita).
* Execução travada (worker morto) é fechada pelo agendador; se o envio pode ter saído (`sending`), **não** é repetida.

## Retentativas

Automáticas só para falhas transitórias (timeout, 429, 5xx, Meta indisponível), no máximo 3 tentativas,
após 5 e 30 minutos. Falhas permanentes (número inválido, Meta desconectada, token revogado) falham uma vez.
Retentativa repete o mesmo período; se a mensagem/relatório já existiam, são reaproveitados (mesmos números, mesmo link).
"Tentar novamente" no histórico também cria uma nova execução ligada à anterior (`parent_run_id`).

## Snapshots e links

Cada execução com relatório detalhado guarda `report_snapshot` e `report_share_token` (uuid v4) próprios.
Link: `/report/run/<token>` (mesma tela limpa do relatório do cliente). A função pública
`get_public_automation_report(token)` lê **apenas** o snapshot da execução; nunca o `published_snapshot` nem o
`share_token` do dashboard, que não são alterados. Execução finalizada é imutável (só o link pode ser revogado).

## Como testar manualmente

1. Configurar `CRON_SECRET`, `WHATSAPP_CLOUD_ACCESS_TOKEN`, `WHATSAPP_CLOUD_PHONE_NUMBER_ID` na Vercel e redeploy.
2. Automações → editar uma automação → **Enviar teste** com o seu número (antes fale com o número da agência no WhatsApp, por causa da janela de 24 h).
3. Conferir o Histórico: origem "Teste", destinatário mascarado, mensagem, "Abrir relatório".
4. **Executar agora** (pede confirmação; envia ao destinatário real).
5. Agendador: `curl -H "Authorization: Bearer $CRON_SECRET" https://<app>/api/cron/report-automations` — retorna contagens; repetir não reenvia.
