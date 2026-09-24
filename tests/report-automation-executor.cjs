const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");

// Acceptance tests for the automation executor, scheduler, WhatsApp provider and
// failure handling. The executor talks to an in-memory RunStore that enforces the
// same rules as the database (unique slot / idempotency key, one-way status,
// immutable finished runs); the SQL side is covered by report-automations-rls.sql.

// realpath: on macOS /var is a symlink to /private/var, which would load modules twice.
const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "laos-executor-")));
const originalResolve = Module._resolveFilename;

async function main() {
  for (const file of [
    "lib/metrics/catalog.ts", "lib/metrics/dates.ts", "lib/metrics/engine.ts", "lib/metrics/meta-events.ts",
    "lib/report-templates/index.ts", "lib/report-templates/from-analysis.ts", "lib/projects/model.ts",
    "lib/integrations/meta-graph.ts",
    ...["periods", "schedule", "model", "engine", "store", "failures", "run-store", "executor", "scheduler"].map((name) => `lib/automations/${name}.ts`),
    "lib/whatsapp/phone.ts", "lib/whatsapp/cloud-api.ts",
  ]) {
    const output = path.join(dir, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  const zodPath = require.resolve("zod");
  Module._resolveFilename = function (request, ...args) {
    if (request === "zod") return zodPath;
    if (request.startsWith("@/")) {
      const target = path.join(dir, request.slice(2));
      return fs.existsSync(`${target}.js`) ? `${target}.js` : path.join(target, "index.js");
    }
    return originalResolve.call(this, request, ...args);
  };
  const load = (file) => require(path.join(dir, file));
  const executor = load("lib/automations/executor.js");
  const scheduler = load("lib/automations/scheduler.js");
  const failures = load("lib/automations/failures.js");
  const store = load("lib/automations/store.js");
  const metaGraph = load("lib/integrations/meta-graph.js");
  const catalog = load("lib/metrics/catalog.js");
  const projectModel = load("lib/projects/model.js");
  const phone = load("lib/whatsapp/phone.js");
  const { WhatsAppCloudProvider } = load("lib/whatsapp/cloud-api.js");

  // ---- fixtures ---------------------------------------------------------------
  const BASE = "https://app.laos.test";
  // 2026-09-28 is a Monday, 2026-10-02 a Friday. Sao Paulo is UTC-3 (no DST then).
  const MONDAY_9H = new Date("2026-09-28T12:00:00.000Z");
  const FRIDAY_9H = new Date("2026-10-02T12:00:00.000Z");
  const PHONE = "+5511999998888";

  const makeConfig = () => ({ ...projectModel.defaultConfig("sales"), title: "Dashboard" });
  const metricsFor = (factor) => Object.fromEntries(catalog.METRIC_IDS.map((id, index) => [id, (index + 1) * 10 * factor]));
  const makeData = (config) => ({
    current: metricsFor(1),
    previous: config.comparison === "none" ? null : metricsFor(0.8),
    daily: [], campaigns: [], adsets: [], ads: [], platforms: [], audience: [], warnings: [],
    currency: "BRL", timezone: "America/Sao_Paulo", primary_metric: config.primary_metric,
    effective_period: { since: config.since, until: config.until, compare_since: config.compare_since, compare_until: config.compare_until },
    updated_at: "2026-09-28T12:00:00.000Z",
  });

  const automation = (overrides = {}) => ({
    id: "auto-1", client_id: "client-1", document_id: "doc-1", name: "Rotina LAOS — segunda", routine_key: "rotina_laos",
    message_template: "overview", period_preset: "friday_sunday", comparison_enabled: true, include_detailed_report: false,
    detailed_report_intro: null, frequency: "weekly", run_weekday: 1, run_time: "09:00:00", timezone: "America/Sao_Paulo",
    channel: "whatsapp", recipient: { type: "phone", phone: PHONE }, status: "active", created_by: "user-1",
    created_at: "2026-09-01T00:00:00Z", updated_at: "2026-09-01T00:00:00Z", last_run_at: null,
    next_run_at: MONDAY_9H.toISOString(), ...overrides,
  });

  function memoryStore(automations, tick) {
    const runs = new Map();
    const dashboards = new Map([["doc-1", { title: "Dashboard", kind: "dashboard", config: makeConfig(), published_snapshot: { title: "PUBLICADO", marker: "manual" }, share_token: "manual-token" }]]);
    let seq = 0;
    const open = (run) => run && (run.status === "scheduled" || run.status === "running");
    const st = {
      runs, dashboards, automations: new Map(automations.map((item) => [item.id, { ...item }])), clock: tick,
      async insertRun(record) {
        for (const run of runs.values()) {
          if (run.idempotency_key === record.idempotency_key) return null;
          if (run.automation_id === record.automation_id && run.scheduled_for === record.scheduled_for && run.attempt === record.attempt) return null;
        }
        const row = {
          id: `run-${++seq}`, status: "scheduled", started_at: null, finished_at: null, message_text: null, error_code: null,
          error_message: null, provider_message_id: null, provider_status: null, report_snapshot: null, report_share_token: null,
          retryable: false, retry_after: null, created_at: st.clock().toISOString(), updated_at: st.clock().toISOString(), ...record,
        };
        runs.set(row.id, row);
        return { ...row };
      },
      async claimRun(id, at) {
        const run = runs.get(id);
        if (!run || run.status !== "scheduled") return null;
        run.status = "running"; run.started_at = at.toISOString();
        return { ...run };
      },
      async saveProgress(id, progress) {
        const run = runs.get(id);
        if (!open(run)) throw Error("finished runs are immutable");
        if (progress.report_snapshot && run.report_snapshot) throw Error("snapshot cannot be rewritten");
        Object.assign(run, progress);
      },
      async finishRun(id, status, finish, at) {
        const run = runs.get(id);
        if (!open(run)) return null;
        Object.assign(run, finish, { status, finished_at: at.toISOString() });
        return { ...run };
      },
      async getRun(id) { return runs.has(id) ? { ...runs.get(id) } : null; },
      async loadAutomation(id) { return st.automations.has(id) ? { ...st.automations.get(id) } : null; },
      async loadDashboard(clientId, documentId) { return dashboards.get(documentId) ?? null; },
      async loadClientName() { return "Cliente Teste"; },
      async advanceNextRun(id, expected, next) {
        const item = st.automations.get(id);
        const same = expected === null ? item.next_run_at === null : item.next_run_at !== null && Date.parse(item.next_run_at) === Date.parse(expected);
        if (!same) return false;
        item.next_run_at = next;
        return true;
      },
      async markRan(id, at) { st.automations.get(id).last_run_at = at.toISOString(); },
      async listDue(now, limit) {
        return [...st.automations.values()].filter((item) => item.status === "active" && item.next_run_at && Date.parse(item.next_run_at) <= now.getTime()).slice(0, limit).map((item) => ({ ...item }));
      },
      async listOpenRunsBefore(cutoff) { return [...runs.values()].filter((run) => open(run) && Date.parse(run.created_at) < cutoff.getTime()).map((run) => ({ ...run })); },
      async hasOpenRunAfter(id, cutoff) { return [...runs.values()].some((run) => run.automation_id === id && open(run) && Date.parse(run.created_at) >= cutoff.getTime()); },
      async listRetryable(now, maxAttempts, limit) {
        const parents = new Set([...runs.values()].map((run) => run.parent_run_id).filter(Boolean));
        return [...runs.values()].filter((run) => run.status === "failed" && run.retryable && Date.parse(run.retry_after) <= now.getTime() && run.attempt < maxAttempts && !parents.has(run.id)).slice(0, limit).map((run) => ({ ...run }));
      },
      byToken(token) { return [...runs.values()].find((run) => run.report_share_token === token && run.report_snapshot) ?? null; },
    };
    return st;
  }

  function harness({ automations = [automation()], nowRef = { value: MONDAY_9H }, collect, sendResults = [], configured = true, baseUrl = BASE } = {}) {
    const clock = () => new Date(nowRef.value.getTime());
    const st = memoryStore(automations, clock);
    const sent = [];
    const logs = [];
    const collected = [];
    let tokens = 0;
    const deps = {
      store: st,
      publicBaseUrl: baseUrl,
      now: clock,
      newToken: () => `00000000-0000-4000-8000-${String(++tokens).padStart(12, "0")}`,
      log: (event, fields) => logs.push({ event, ...fields }),
      collect: collect ?? (async (clientId, config) => {
        const data = makeData(config);
        collected.push({ clientId, config, data });
        return data;
      }),
      provider: {
        name: "fake_provider", supportsGroups: false, isConfigured: () => configured,
        async send(message) {
          sent.push(message);
          const next = sendResults.shift();
          return next ?? { ok: true, messageId: `wamid.${sent.length}`, providerStatus: "accepted" };
        },
      },
    };
    return { deps, st, sent, logs, collected, nowRef };
  }

  const runOf = (h, index = 0) => [...h.st.runs.values()][index];
  const scheduledRequest = (h, item = h.st.automations.get("auto-1")) => ({ automation: { ...item }, trigger: "scheduled", scheduledFor: new Date(item.next_run_at) });

  // ---- T1: Rotina LAOS, Monday -> Friday..Sunday -----------------------------------
  {
    const h = harness();
    const outcome = await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    assert.equal(outcome.status, "sent");
    const run = runOf(h);
    assert.equal(`${run.period_since}..${run.period_until}`, "2026-09-25..2026-09-27", "T1: Monday run reports Friday-Sunday");
    assert.equal(run.trigger_type, "scheduled");
    assert.equal(run.status, "sent");
    assert.equal(run.provider_message_id, "wamid.1");
    assert.equal(run.provider, "fake_provider");
    assert.equal(run.recipient_label, "+55 •••••8888", "history keeps a masked number");
    assert.ok(!JSON.stringify(run).includes("999998888"), "the full number is never stored in the run");
    assert.equal(h.sent.length, 1);
    assert.equal(h.sent[0].to, PHONE);
    assert.ok(h.sent[0].text.includes("25/09") && h.sent[0].text.includes("27/09"), "message shows the run's period");
    // next_run_at moved to the following Monday 09:00 (local).
    assert.equal(h.st.automations.get("auto-1").next_run_at, "2026-10-05T12:00:00.000Z");
    assert.equal(h.st.automations.get("auto-1").last_run_at, MONDAY_9H.toISOString());
  }

  // ---- T2: Friday -> Monday..Thursday -----------------------------------------------
  {
    const h = harness({
      nowRef: { value: FRIDAY_9H },
      automations: [automation({ run_weekday: 5, period_preset: "monday_thursday", next_run_at: FRIDAY_9H.toISOString() })],
    });
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const run = runOf(h);
    assert.equal(`${run.period_since}..${run.period_until}`, "2026-09-28..2026-10-01", "T2: Friday run reports Monday-Thursday");
    assert.equal(`${run.compare_since}..${run.compare_until}`, "2026-09-21..2026-09-24", "T4: comparison is the equivalent previous block");
  }

  // ---- T3: Semanal completo ---------------------------------------------------------
  {
    const h = harness({ automations: [automation({ period_preset: "monday_sunday" })] });
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const run = runOf(h);
    assert.equal(`${run.period_since}..${run.period_until}`, "2026-09-21..2026-09-27", "T3: Monday..Sunday of the week that ended");
    assert.equal(`${run.compare_since}..${run.compare_until}`, "2026-09-14..2026-09-20", "T4: previous equivalent week");
  }

  // ---- T4: comparison off -----------------------------------------------------------
  {
    const h = harness({ automations: [automation({ comparison_enabled: false })] });
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const run = runOf(h);
    assert.equal(run.compare_since, null);
    assert.equal(h.collected[0].config.comparison, "none", "no comparison collected when disabled");
    // The shared message templates deliberately carry no comparison text (their own
    // tests pin that), so the comparison lives in the collected data and the
    // detailed report; the message must simply not change or break when it is off.
    const withComparison = harness({ automations: [automation({ include_detailed_report: true })] });
    await executor.executeAutomationRun(withComparison.deps, scheduledRequest(withComparison));
    assert.equal(withComparison.collected[0].config.comparison, "custom");
    assert.notEqual(runOf(withComparison).report_snapshot.data.previous, null, "the detailed report carries the comparison");
    const withoutDetailed = harness({ automations: [automation({ include_detailed_report: true, comparison_enabled: false })] });
    await executor.executeAutomationRun(withoutDetailed.deps, scheduledRequest(withoutDetailed));
    assert.equal(runOf(withoutDetailed).report_snapshot.data.previous, null, "no comparison in the report when disabled");
  }

  // ---- data is collected for THIS run's exact period (never a rolling window) -------
  {
    const h = harness();
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const { config } = h.collected[0];
    assert.equal(h.collected[0].clientId, "client-1", "collection is scoped to the automation's own client");
    assert.deepEqual([config.preset, config.since, config.until], ["custom", "2026-09-25", "2026-09-27"]);
    assert.deepEqual([config.comparison, config.compare_since, config.compare_until], ["custom", "2026-09-18", "2026-09-20"]);
  }

  // ---- T5: Executar agora generates a run through the same executor ----------------
  {
    const nowRef = { value: new Date("2026-09-30T15:00:00.000Z") }; // Wednesday
    const h = harness({ nowRef });
    const item = h.st.automations.get("auto-1");
    const before = item.next_run_at;
    const outcome = await executor.executeAutomationRun(h.deps, {
      automation: { ...item }, trigger: "manual", scheduledFor: nowRef.value, requestedBy: "user-9", requestKey: "click-1",
    });
    assert.equal(outcome.status, "sent");
    const run = runOf(h);
    assert.equal(run.trigger_type, "manual");
    assert.equal(run.requested_by, "user-9");
    assert.equal(`${run.period_since}..${run.period_until}`, "2026-09-25..2026-09-27", "manual run reports the most recent complete block");
    assert.equal(h.sent.length, 1);
    assert.equal(h.st.automations.get("auto-1").next_run_at, before, "manual run does not move the schedule");
    // A double click (same request key) is one run.
    const again = await executor.executeAutomationRun(h.deps, {
      automation: { ...item }, trigger: "manual", scheduledFor: new Date(nowRef.value.getTime() + 1), requestedBy: "user-9", requestKey: "click-1",
    });
    assert.equal(again.status, "duplicate");
    assert.equal(h.sent.length, 1, "double click sends once");
    // A different click while the first is still open is refused as busy.
    h.st.runs.get(run.id).status = "running"; // simulate in-flight
    const busy = await executor.executeAutomationRun(h.deps, {
      automation: { ...item }, trigger: "manual", scheduledFor: new Date(nowRef.value.getTime() + 2), requestKey: "click-2",
    });
    assert.equal(busy.status, "busy");
    assert.equal(h.sent.length, 1);
  }

  // ---- T6: cron called twice / concurrent workers / redelivery -> ONE send -----------
  {
    const h = harness();
    const first = await scheduler.runSchedulerPass(h.deps);
    const second = await scheduler.runSchedulerPass(h.deps);
    assert.equal(first.executed, 1);
    assert.equal(second.executed, 0, "the second pass finds nothing due");
    assert.equal(h.sent.length, 1, "T6: two cron calls, one message");

    const c = harness();
    const request = scheduledRequest(c);
    const results = await Promise.all([
      executor.executeAutomationRun(c.deps, { ...request, automation: { ...request.automation } }),
      executor.executeAutomationRun(c.deps, { ...request, automation: { ...request.automation } }),
      executor.executeAutomationRun(c.deps, { ...request, automation: { ...request.automation } }),
    ]);
    assert.deepEqual(results.map((item) => item.status).sort(), ["duplicate", "duplicate", "sent"], "only one concurrent worker takes the slot");
    assert.equal(c.sent.length, 1, "concurrency: one send");
    assert.equal(c.st.runs.size, 1);
    // A stale copy of the automation (Vercel redelivery after the schedule moved on) is a no-op too.
    const stale = await executor.executeAutomationRun(c.deps, { ...request, automation: { ...request.automation } });
    assert.equal(stale.status, "duplicate");
    assert.equal(c.sent.length, 1);
  }

  // ---- T7: Meta disconnected -> failed, no zeros, nothing sent ----------------------
  {
    const h = harness({ collect: async () => { throw new metaGraph.MetaConnectionError("A conexão expirou ou foi revogada.", "expired"); } });
    const outcome = await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    assert.equal(outcome.status, "failed");
    const run = runOf(h);
    assert.equal(run.error_code, "integration_disconnected");
    assert.ok(run.error_message.startsWith("Meta Ads desconectada"), run.error_message);
    assert.equal(run.message_text, null, "no message was even built");
    assert.equal(h.sent.length, 0, "T7: nothing is sent when the integration is disconnected");
    assert.equal(run.retryable, false, "a disconnected integration is permanent: no retry loop");
    assert.equal(run.retry_after, null);

    const notLinked = harness({ collect: async () => { throw new metaGraph.MetaConnectionError("Vincule", "not_linked"); } });
    await executor.executeAutomationRun(notLinked.deps, scheduledRequest(notLinked));
    assert.equal(runOf(notLinked).error_code, "integration_not_linked");

    const revoked = harness({ collect: async () => { throw new metaGraph.MetaGraphError("Token inválido", 190); } });
    await executor.executeAutomationRun(revoked.deps, scheduledRequest(revoked));
    assert.equal(runOf(revoked).error_code, "integration_disconnected");
    assert.equal(revoked.sent.length, 0);

    // Empty collection (Meta returned nothing) is not a report of zeros.
    const empty = harness({
      collect: async (clientId, config) => ({ ...makeData(config), current: Object.fromEntries(catalog.METRIC_IDS.map((id) => [id, null])) }),
    });
    await executor.executeAutomationRun(empty.deps, scheduledRequest(empty));
    assert.equal(runOf(empty).status, "failed");
    assert.equal(runOf(empty).error_code, "no_data");
    assert.ok(runOf(empty).error_message.startsWith("Não foi possível coletar dados para o período."));
    assert.equal(empty.sent.length, 0);

    // Data for another period is refused.
    const wrong = harness({ collect: async (clientId, config) => ({ ...makeData(config), effective_period: { since: "2026-01-01", until: "2026-01-03" } }) });
    await executor.executeAutomationRun(wrong.deps, scheduledRequest(wrong));
    assert.equal(runOf(wrong).error_code, "period_mismatch");
    assert.equal(wrong.sent.length, 0);

    // A Meta outage is transient: retryable with a delay, still nothing sent.
    const outage = harness({ collect: async () => { throw new metaGraph.MetaGraphError("down", 2, "OAuthException", true); } });
    await executor.executeAutomationRun(outage.deps, scheduledRequest(outage));
    assert.equal(runOf(outage).error_code, "collection_transient");
    assert.equal(runOf(outage).retryable, true);
    assert.equal(outage.sent.length, 0);
  }

  // ---- comparison week without data: dropped from message AND report, said so -------
  {
    const h = harness({
      automations: [automation({ include_detailed_report: true })],
      collect: async (clientId, config) => ({ ...makeData(config), previous: Object.fromEntries(catalog.METRIC_IDS.map((id) => [id, null])) }),
    });
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const run = runOf(h);
    assert.equal(run.status, "sent");
    assert.equal(run.report_snapshot.data.previous, null);
    assert.ok(run.report_snapshot.data.warnings.includes("Sem dados no período de comparação."));
  }

  // ---- T8: detailed report -> link in message -> link resolves to the run's snapshot -
  {
    const h = harness({ automations: [automation({ include_detailed_report: true, detailed_report_intro: null })] });
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const run = runOf(h);
    const token = run.report_share_token;
    assert.match(token, /^[0-9a-f-]{36}$/);
    const link = `${BASE}/report/run/${token}`;
    assert.ok(h.sent[0].text.includes("📊 Relatório detalhado\nVeja todas as métricas, gráficos e informações:"), "default intro block");
    assert.ok(h.sent[0].text.trimEnd().endsWith(link), "the message ends with THIS run's own link");
    assert.equal(run.message_text, h.sent[0].text, "the history keeps exactly what was sent");
    const resolved = h.st.byToken(token);
    assert.equal(resolved.id, run.id, "T8: the link opens this run's snapshot");
    assert.equal(resolved.report_snapshot.data.effective_period.since, "2026-09-25");
    assert.equal(resolved.report_snapshot.data.effective_period.compare_since, "2026-09-18");
    assert.equal(resolved.report_snapshot.title, "Dashboard");
    // Message and report describe the same collection: same numbers.
    assert.deepEqual(resolved.report_snapshot.data.current, h.collected[0].data.current);
    // The dashboard's own publication is untouched and NOT what the link uses.
    const dash = h.st.dashboards.get("doc-1");
    assert.equal(dash.share_token, "manual-token");
    assert.equal(dash.published_snapshot.marker, "manual");
    assert.notEqual(token, "manual-token");

    // Custom intro replaces only the lead-in text.
    const custom = harness({ automations: [automation({ include_detailed_report: true, detailed_report_intro: "Confira tudo aqui:" })] });
    await executor.executeAutomationRun(custom.deps, scheduledRequest(custom));
    assert.ok(custom.sent[0].text.includes("Confira tudo aqui:\n\n" + `${BASE}/report/run/`));

    // Detailed off -> no link, no snapshot, no token.
    const off = harness();
    await executor.executeAutomationRun(off.deps, scheduledRequest(off));
    assert.equal(runOf(off).report_snapshot, null);
    assert.equal(runOf(off).report_share_token, null);
    assert.ok(!off.sent[0].text.includes("/report/run/"));

    // No usable public URL in this environment: refuse rather than send a dead link.
    const noUrl = harness({ automations: [automation({ include_detailed_report: true })], baseUrl: null });
    await executor.executeAutomationRun(noUrl.deps, scheduledRequest(noUrl));
    assert.equal(runOf(noUrl).error_code, "public_url_missing");
    assert.equal(noUrl.sent.length, 0);
  }

  // ---- T9: the dashboard changes later -> the old link does not ---------------------
  {
    const h = harness({ automations: [automation({ include_detailed_report: true })] });
    await executor.executeAutomationRun(h.deps, scheduledRequest(h));
    const first = runOf(h);
    const frozen = JSON.stringify(first.report_snapshot);
    // The collector's own object and the dashboard are mutated after the run.
    h.collected[0].data.current.spend = 999999;
    h.collected[0].data.warnings.push("changed later");
    h.collected[0].config.metrics = [];
    const dash = h.st.dashboards.get("doc-1");
    dash.title = "Renomeado"; dash.config.subtitle = "Alterado";
    // A later week runs and creates ITS OWN link.
    h.nowRef.value = new Date("2026-10-05T12:00:00.000Z");
    await scheduler.runSchedulerPass(h.deps);
    const second = runOf(h, 1);
    assert.equal(JSON.stringify(first.report_snapshot), frozen, "T9: the old snapshot is byte-for-byte unchanged");
    assert.notEqual(second.report_share_token, first.report_share_token);
    assert.equal(h.st.byToken(first.report_share_token).report_snapshot.title, "Dashboard");
    assert.equal(h.st.byToken(second.report_share_token).report_snapshot.title, "Renomeado");
    assert.equal(h.st.dashboards.get("doc-1").share_token, "manual-token", "the manual share token is never replaced");
    await assert.rejects(h.st.saveProgress(first.id, { message_text: "edit" }), /immutable/, "a finished run cannot be edited");
  }

  // ---- T10: WhatsApp fails -> run failed, readable error in history -----------------
  {
    const permanent = harness({ sendResults: [{ ok: false, code: "recipient_unreachable", transient: false, message: "O WhatsApp não conseguiu entregar a este número.", providerStatus: "http_400:131026" }] });
    const outcome = await executor.executeAutomationRun(permanent.deps, scheduledRequest(permanent));
    assert.equal(outcome.status, "failed");
    const run = runOf(permanent);
    assert.equal(run.status, "failed");
    assert.equal(run.error_code, "recipient_unreachable");
    assert.ok(run.error_message.length > 10);
    assert.equal(run.provider_status, "http_400:131026");
    assert.equal(run.retryable, false, "permanent failure: no retry loop");
    assert.ok(run.message_text, "the message that failed to send stays in the history");
    assert.equal(run.provider_message_id, null);
    assert.equal(permanent.st.automations.get("auto-1").next_run_at, "2026-10-05T12:00:00.000Z", "the schedule still moves on after a final failure");

    const unconfigured = harness({ configured: false });
    await executor.executeAutomationRun(unconfigured.deps, scheduledRequest(unconfigured));
    assert.equal(runOf(unconfigured).error_code, "provider_not_configured");
    assert.equal(unconfigured.collected.length, 0, "no data is collected when nothing could be sent");
    assert.equal(unconfigured.sent.length, 0);

    const invalid = harness({ automations: [automation({ recipient: { type: "phone", phone: "+5500999998888" } })] });
    await executor.executeAutomationRun(invalid.deps, scheduledRequest(invalid));
    assert.equal(runOf(invalid).error_code, "invalid_recipient", "an invalid DDD is never sent to");
    assert.equal(invalid.sent.length, 0);

    const group = harness({ automations: [automation({ recipient: { type: "group", group_id: "g-1" } })] });
    await executor.executeAutomationRun(group.deps, scheduledRequest(group));
    assert.equal(runOf(group).error_code, "recipient_unsupported");
    assert.equal(group.sent.length, 0);

    const dead = harness({ collect: async () => { throw Error("Falha com access_token=EAAB1234567890abcdefghijklmn"); } });
    await executor.executeAutomationRun(dead.deps, scheduledRequest(dead));
    assert.ok(!JSON.stringify(runOf(dead)).includes("EAAB1234567890"), "credentials never reach the history");
  }

  // ---- retries: bounded, transient only, same period, no duplicate ------------------
  {
    const transient = { ok: false, code: "provider_unavailable", transient: true, message: "O WhatsApp está temporariamente indisponível.", providerStatus: "http_503" };
    const h = harness({ sendResults: [{ ...transient }, { ...transient }, { ...transient }, { ...transient }] });
    await scheduler.runSchedulerPass(h.deps); // attempt 1 fails
    let first = runOf(h);
    assert.equal(first.attempt, 1);
    assert.equal(first.retryable, true);
    assert.equal(Date.parse(first.retry_after) - MONDAY_9H.getTime(), 5 * 60_000, "first retry after 5 min");
    let pass = await scheduler.runSchedulerPass(h.deps);
    assert.equal(pass.retried, 0, "too early: not retried yet");
    // Later, on a different weekday: the retry still reports the ORIGINAL period.
    h.nowRef.value = new Date(MONDAY_9H.getTime() + 2 * 24 * 3_600_000);
    pass = await scheduler.runSchedulerPass(h.deps);
    assert.equal(pass.retried, 1);
    const second = runOf(h, 1);
    assert.equal(second.attempt, 2);
    assert.equal(second.parent_run_id, first.id, "a retry records the run it repeats");
    assert.equal(`${second.period_since}..${second.period_until}`, "2026-09-25..2026-09-27", "a late retry keeps the original period");
    assert.equal(second.scheduled_for, first.scheduled_for);
    assert.equal(second.status, "failed");
    assert.equal(Date.parse(second.retry_after) - h.nowRef.value.getTime(), 30 * 60_000, "second retry after 30 min");
    assert.equal(h.collected.length, 1, "attempt 2 failed at SEND; the report is reused, not recollected");
    h.nowRef.value = new Date(h.nowRef.value.getTime() + 3_600_000);
    await scheduler.runSchedulerPass(h.deps);
    const third = runOf(h, 2);
    assert.equal(third.attempt, 3);
    assert.equal(third.retryable, false, "attempts are bounded: the third failure is final");
    assert.equal(third.retry_after, null);
    h.nowRef.value = new Date(h.nowRef.value.getTime() + 24 * 3_600_000);
    pass = await scheduler.runSchedulerPass(h.deps);
    assert.equal(pass.retried, 0);
    assert.equal(h.sent.length, 3, "exactly three attempts, no loop");
    assert.equal(h.sent[0].text, h.sent[1].text, "the retry sends the very same message");
    assert.equal(h.sent[1].text, h.sent[2].text);

    // Retry that succeeds; and a second retry of the same failed run is a duplicate.
    const ok = harness({ sendResults: [{ ...transient }] });
    await scheduler.runSchedulerPass(ok.deps);
    const failed = runOf(ok);
    ok.nowRef.value = new Date(MONDAY_9H.getTime() + 10 * 60_000);
    const item = ok.st.automations.get("auto-1");
    const retried = await executor.executeAutomationRun(ok.deps, { automation: { ...item }, trigger: "scheduled", scheduledFor: new Date(failed.scheduled_for), retryOf: failed });
    assert.equal(retried.status, "sent");
    const dup = await executor.executeAutomationRun(ok.deps, { automation: { ...item }, trigger: "scheduled", scheduledFor: new Date(failed.scheduled_for), retryOf: failed });
    assert.equal(dup.status, "duplicate", "retrying the same failed run twice sends once");
    assert.equal(ok.sent.length, 2);

    // Retry after a COLLECTION failure recollects, still for the original period.
    let calls = 0;
    const late = harness({
      collect: async (clientId, config) => { calls += 1; if (calls === 1) throw new metaGraph.MetaGraphError("down", 2, "x", true); return makeData(config); },
    });
    await scheduler.runSchedulerPass(late.deps);
    late.nowRef.value = new Date(MONDAY_9H.getTime() + 3 * 24 * 3_600_000);
    await scheduler.runSchedulerPass(late.deps);
    const retry = runOf(late, 1);
    assert.equal(retry.status, "sent");
    assert.equal(`${retry.period_since}..${retry.period_until}`, "2026-09-25..2026-09-27");
    assert.equal(late.collected.length, 0);
    assert.equal(calls, 2);
  }

  // ---- test send ---------------------------------------------------------------------
  {
    const h = harness();
    const item = h.st.automations.get("auto-1");
    const before = { next: item.next_run_at, last: item.last_run_at };
    const outcome = await executor.executeAutomationRun(h.deps, {
      automation: { ...item }, trigger: "test", scheduledFor: new Date(MONDAY_9H.getTime() + 5), requestedBy: "user-9", requestKey: "t-1", testPhone: "+351912345678",
    });
    assert.equal(outcome.status, "sent");
    const run = runOf(h);
    assert.equal(run.trigger_type, "test");
    assert.equal(h.sent[0].to, "+351912345678", "the test goes to the typed number");
    assert.notEqual(h.sent[0].to, PHONE, "never to the production recipient");
    assert.ok(h.sent[0].text.startsWith(executor.TEST_MESSAGE_PREFIX), "the recipient can tell it is a test");
    assert.equal(run.recipient_label, "+351 •••••5678");
    assert.equal(h.st.automations.get("auto-1").next_run_at, before.next, "a test never changes next_run_at");
    assert.equal(h.st.automations.get("auto-1").last_run_at, before.last, "nor last_run_at");
    await assert.rejects(
      executor.executeAutomationRun(h.deps, { automation: { ...item }, trigger: "test", scheduledFor: new Date(), testPhone: "abc" }),
      /telefone|Telefone/,
    );
    assert.equal(h.st.runs.size, 1, "an invalid test number creates no run");
  }

  // ---- T11: paused -> the scheduler ignores it --------------------------------------
  {
    const h = harness({ automations: [automation({ status: "paused" })] });
    const pass = await scheduler.runSchedulerPass(h.deps);
    assert.equal(pass.due, 0, "T11: paused automations are not even considered");
    assert.equal(h.sent.length, 0);
    assert.equal(h.st.runs.size, 0);
    assert.equal(store.computeNextRunAt({ status: "paused", run_weekday: 1, run_time: "09:00", timezone: "America/Sao_Paulo" }, MONDAY_9H), null, "pausing clears next_run_at");
  }

  // ---- T12: reactivated -> next run recalculated (future, right weekday/time) -------
  {
    const now = new Date("2026-09-30T15:00:00.000Z"); // Wednesday
    const next = store.computeNextRunAt({ status: "active", run_weekday: 1, run_time: "09:00", timezone: "America/Sao_Paulo" }, now);
    assert.equal(next, "2026-10-05T12:00:00.000Z", "T12: next Monday 09:00 local, not the missed one");
    const h = harness({ nowRef: { value: now }, automations: [automation({ next_run_at: next })] });
    assert.equal((await scheduler.runSchedulerPass(h.deps)).due, 0, "not due yet");
  }

  // ---- scheduler safety: lateness, stale runs, time budget ---------------------------
  {
    const h = harness({ nowRef: { value: new Date(MONDAY_9H.getTime() + 40 * 3_600_000) } });
    const pass = await scheduler.runSchedulerPass(h.deps);
    assert.equal(pass.skipped, 1);
    assert.equal(h.sent.length, 0, "a run more than 36 h late is skipped, not sent");
    assert.equal(runOf(h).status, "skipped");
    assert.equal(runOf(h).error_code, "missed_window");
    assert.ok(Date.parse(h.st.automations.get("auto-1").next_run_at) > h.nowRef.value.getTime(), "and the schedule moves on");

    // Daily-cron world: 21 h late is still sent, for the week it was due.
    const daily = harness({ nowRef: { value: new Date(MONDAY_9H.getTime() + 21 * 3_600_000) } });
    await scheduler.runSchedulerPass(daily.deps);
    assert.equal(daily.sent.length, 1);
    assert.equal(`${runOf(daily).period_since}..${runOf(daily).period_until}`, "2026-09-25..2026-09-27", "a late tick still reports the intended block");

    // Stale runs: a crash mid-send is NOT retried (it may have left); before send it is.
    const s = harness();
    const base = { automation_id: "auto-1", client_id: "client-1", scheduled_for: MONDAY_9H.toISOString(), trigger_type: "scheduled", parent_run_id: null, requested_by: null, recipient_label: null, provider: "x", timezone: "America/Sao_Paulo", period_preset: "friday_sunday", period_since: "2026-09-25", period_until: "2026-09-27", compare_since: null, compare_until: null, message_template: "overview" };
    const mid = await s.st.insertRun({ ...base, attempt: 1, idempotency_key: "k1" });
    await s.st.claimRun(mid.id, MONDAY_9H);
    await s.st.saveProgress(mid.id, { provider_status: "sending" });
    const early = await s.st.insertRun({ ...base, attempt: 2, idempotency_key: "k2" });
    await s.st.claimRun(early.id, MONDAY_9H);
    const done = await s.st.insertRun({ ...base, attempt: 3, idempotency_key: "k3" });
    await s.st.claimRun(done.id, MONDAY_9H);
    await s.st.saveProgress(done.id, { provider_status: "accepted", provider_message_id: "wamid.9" });
    s.nowRef.value = new Date(MONDAY_9H.getTime() + 60 * 60_000);
    s.st.automations.get("auto-1").next_run_at = null;
    const reaped = await scheduler.runSchedulerPass(s.deps);
    assert.equal(reaped.reaped, 3);
    assert.equal(s.st.runs.get(mid.id).error_code, "send_unknown");
    assert.equal(s.st.runs.get(mid.id).retryable, false, "unknown send outcome is never auto-retried (could duplicate)");
    assert.equal(s.st.runs.get(early.id).error_code, "stale_run");
    assert.equal(s.st.runs.get(early.id).retryable, true);
    assert.equal(s.st.runs.get(done.id).status, "sent", "a message the provider accepted is recorded as sent");

    // Time budget: leftovers stay due for the next pass instead of being dropped.
    const many = harness({ automations: ["a", "b", "c"].map((id) => automation({ id: `auto-${id}`, name: id })) });
    let elapsed = 0;
    many.deps.now = () => new Date(MONDAY_9H.getTime() + elapsed);
    const realSend = many.deps.provider.send;
    many.deps.provider.send = async (message) => { elapsed += 30_000; return realSend(message); }; // each send "takes" 30 s
    const budget = await scheduler.runSchedulerPass(many.deps, { budgetMs: 45_000 });
    assert.equal(budget.deferred, true);
    assert.equal(many.sent.length, 2, "the third run waits for the next pass");
    assert.equal(many.st.automations.get("auto-c").next_run_at, MONDAY_9H.toISOString(), "and stays due");
  }

  // ---- observability: useful, and free of secrets and message content ---------------
  {
    const h = harness({ automations: [automation({ include_detailed_report: true })] });
    await scheduler.runSchedulerPass(h.deps);
    const text = JSON.stringify(h.logs);
    assert.ok(h.logs.some((entry) => entry.event === "automation_run.sent" && entry.period === "2026-09-25..2026-09-27" && entry.trigger === "scheduled"));
    assert.ok(h.logs.some((entry) => entry.event === "automation_scheduler.pass"));
    assert.ok(!text.includes("999998888") && !text.includes(PHONE), "no phone number in logs");
    assert.ok(!text.includes("00000000-0000-4000"), "no report token in logs");
    assert.ok(!text.includes("RESUMO"), "no message content in logs");
  }

  // ---- SupabaseRunStore: the real queries, against a tiny PostgREST emulator ------------
  {
    const { SupabaseRunStore } = load("lib/automations/run-store.js");
    const tables = { agency_report_automation_runs: [], agency_report_automations: [], agency_documents: [], agency_clients: [] };
    let counter = 0;
    const cmp = (a, b) => (typeof a === "string" && /^\d{4}-\d\d-\d\dT/.test(a) ? Date.parse(a) - Date.parse(b) : a < b ? -1 : a > b ? 1 : 0);
    const db = {
      from(name) {
        const q = { op: "select", filters: [], values: null, lim: Infinity, ord: null };
        const rows = () => tables[name];
        const run = () => {
          let result;
          if (q.op === "insert") {
            const row = { id: `id-${++counter}`, status: "scheduled", ...q.values };
            if (name === "agency_report_automation_runs" && rows().some((r) => r.idempotency_key === row.idempotency_key || (r.automation_id === row.automation_id && r.scheduled_for === row.scheduled_for && r.attempt === row.attempt))) {
              return { data: null, error: { code: "23505" } };
            }
            rows().push(row);
            result = [row];
          } else {
            let matched = rows().filter((row) => q.filters.every((f) => f(row)));
            if (q.ord) matched = [...matched].sort((a, b) => (q.ord.ascending ? 1 : -1) * cmp(a[q.ord.key], b[q.ord.key]));
            matched = matched.slice(0, q.lim);
            if (q.op === "update") for (const row of matched) Object.assign(row, q.values);
            result = matched;
          }
          return { data: result, error: null };
        };
        const finish = (mode) => {
          const out = run();
          if (out.error) return Promise.resolve(out);
          return Promise.resolve({ data: mode ? (out.data[0] ?? null) : out.data, error: null });
        };
        const api = {
          select() { return api; },
          insert(values) { q.op = "insert"; q.values = values; return api; },
          update(values) { q.op = "update"; q.values = values; return api; },
          eq(key, value) { q.filters.push((r) => r[key] === value); return api; },
          in(key, values) { q.filters.push((r) => values.includes(r[key])); return api; },
          lt(key, value) { q.filters.push((r) => r[key] != null && cmp(r[key], value) < 0); return api; },
          lte(key, value) { q.filters.push((r) => r[key] != null && cmp(r[key], value) <= 0); return api; },
          gte(key, value) { q.filters.push((r) => r[key] != null && cmp(r[key], value) >= 0); return api; },
          is(key, value) { q.filters.push((r) => (r[key] ?? null) === value); return api; },
          not(key, op, value) { q.filters.push((r) => (r[key] ?? null) !== value); return api; },
          order(key, options) { q.ord = { key, ascending: options?.ascending !== false }; return api; },
          limit(count) { q.lim = count; return api; },
          single() { return finish(true); },
          maybeSingle() { return finish(true); },
          then(resolve, reject) { return finish(false).then(resolve, reject); },
        };
        return api;
      },
    };
    const real = new SupabaseRunStore(db);
    const record = (over = {}) => ({
      automation_id: "auto-1", client_id: "client-1", attempt: 1, scheduled_for: MONDAY_9H.toISOString(), trigger_type: "scheduled",
      parent_run_id: null, requested_by: null, idempotency_key: "k-1", recipient_label: null, provider: "p", timezone: "America/Sao_Paulo",
      period_preset: "friday_sunday", period_since: "2026-09-25", period_until: "2026-09-27", compare_since: null, compare_until: null,
      message_template: "overview", ...over,
    });
    const first = await real.insertRun(record());
    assert.ok(first, "first insert wins");
    assert.equal(await real.insertRun(record({ attempt: 2 })), null, "same idempotency key -> null, not an error");
    assert.equal(await real.insertRun(record({ idempotency_key: "k-2" })), null, "same slot -> null");
    assert.ok(await real.claimRun(first.id, MONDAY_9H), "first claim wins");
    assert.equal(await real.claimRun(first.id, MONDAY_9H), null, "second claim loses (status filter)");
    await real.saveProgress(first.id, { message_text: "m" });
    assert.equal((await real.finishRun(first.id, "failed", { error_code: "x", error_message: "y", retryable: true, retry_after: new Date(MONDAY_9H.getTime() + 300_000).toISOString() }, MONDAY_9H)).status, "failed");
    assert.equal(await real.finishRun(first.id, "sent", {}, MONDAY_9H), null, "a finished run cannot be finished again");
    await assert.doesNotReject(real.saveProgress(first.id, { message_text: "late" }), "filtered out by status, never an error");
    assert.equal(tables.agency_report_automation_runs[0].message_text, "m", "and it did not change the finished run");

    // Retry queue: due, retryable, attempt below the cap, no child yet.
    const later = new Date(MONDAY_9H.getTime() + 600_000);
    assert.equal((await real.listRetryable(new Date(MONDAY_9H.getTime() + 60_000), 3, 5)).length, 0, "not due yet");
    assert.equal((await real.listRetryable(later, 3, 5)).length, 1);
    await real.insertRun(record({ attempt: 2, idempotency_key: "retry:" + first.id, parent_run_id: first.id }));
    assert.equal((await real.listRetryable(later, 3, 5)).length, 0, "a run that already has a retry is not offered again");

    // Open runs / stale detection.
    const open = await real.insertRun(record({ scheduled_for: new Date(MONDAY_9H.getTime() + 999).toISOString(), idempotency_key: "k-open" }));
    tables.agency_report_automation_runs.find((r) => r.id === open.id).created_at = MONDAY_9H.toISOString();
    assert.deepEqual((await real.listOpenRunsBefore(later)).map((run) => run.id), [open.id], "open runs older than the cutoff are stale; finished ones never are");
    assert.equal(await real.hasOpenRunAfter("auto-1", new Date(MONDAY_9H.getTime() - 1)), true);

    // Due automations and the compare-and-set on next_run_at.
    tables.agency_report_automations.push(
      { id: "due", status: "active", next_run_at: MONDAY_9H.toISOString() },
      { id: "future", status: "active", next_run_at: new Date(MONDAY_9H.getTime() + 86_400_000).toISOString() },
      { id: "paused", status: "paused", next_run_at: MONDAY_9H.toISOString() },
      { id: "nulled", status: "active", next_run_at: null },
    );
    assert.deepEqual((await real.listDue(MONDAY_9H, 10)).map((row) => row.id), ["due"], "only active automations whose time has come");
    assert.equal(await real.advanceNextRun("due", new Date(MONDAY_9H.getTime() + 5).toISOString(), "2026-10-05T12:00:00.000Z"), false, "stale expectation: nothing overwritten");
    assert.equal(await real.advanceNextRun("due", MONDAY_9H.toISOString(), "2026-10-05T12:00:00.000Z"), true);
    assert.equal(tables.agency_report_automations.find((row) => row.id === "due").next_run_at, "2026-10-05T12:00:00.000Z");
  }

  // ---- WhatsApp Cloud API provider ---------------------------------------------------
  {
    const calls = [];
    const make = (responder, config = {}) => new WhatsAppCloudProvider({
      accessToken: "TOKEN-123", phoneNumberId: "555", ...config,
      fetchImpl: async (url, init) => { calls.push({ url, init }); return responder(url, init); },
    });
    const json = (status, body) => ({ ok: status < 400, status, json: async () => body });
    const ok = await make(() => json(200, { messages: [{ id: "wamid.ABC" }] })).send({ to: "+5511999998888", text: "oi" });
    assert.deepEqual(ok, { ok: true, messageId: "wamid.ABC", providerStatus: "accepted" });
    assert.equal(calls[0].url, "https://graph.facebook.com/v22.0/555/messages");
    assert.equal(calls[0].init.headers.Authorization, "Bearer TOKEN-123", "the token travels only in the header");
    assert.equal(JSON.parse(calls[0].init.body).to, "5511999998888", "digits only");
    assert.ok(!calls[0].init.body.includes("TOKEN-123"));
    assert.equal(JSON.parse(calls[0].init.body).text.body, "oi");

    const cases = [
      [401, { error: { code: 190, message: "expired" } }, "provider_auth", false],
      [400, { error: { code: 131047, message: "re-engagement" } }, "outside_window", false],
      [400, { error: { code: 131026, message: "undeliverable" } }, "recipient_unreachable", false],
      [429, { error: { code: 130429, message: "rate" } }, "rate_limited", true],
      [503, {}, "provider_unavailable", true],
      [400, { error: { code: 100, message: "Invalid parameter" } }, "provider_rejected", false],
    ];
    for (const [status, body, code, transient] of cases) {
      const result = await make(() => json(status, body)).send({ to: "+5511999998888", text: "oi" });
      assert.equal(result.ok, false);
      assert.equal(result.code, code, `${status} ${JSON.stringify(body)}`);
      assert.equal(result.transient, transient, code);
      assert.ok(!JSON.stringify(result).includes("TOKEN-123"));
    }
    const network = await make(() => { throw new Error("socket hang up"); }).send({ to: "+5511999998888", text: "oi" });
    assert.equal(network.transient, true);
    const missingId = await make(() => json(200, {})).send({ to: "+5511999998888", text: "oi" });
    assert.equal(missingId.ok, false, "no provider message id -> not counted as sent");
    const notConfigured = new WhatsAppCloudProvider({});
    assert.equal(notConfigured.isConfigured(), false);
    assert.equal((await notConfigured.send({ to: "+5511999998888", text: "x" })).code, "provider_not_configured");
    assert.equal(calls.length, cases.length + 3);
    assert.equal((await make(() => json(200, {})).send({ to: "+5511999998888", text: "x".repeat(4097) })).ok, false, "over the 4096-char limit");
  }

  // ---- phone numbers -----------------------------------------------------------------
  {
    const good = (input) => { const result = phone.normalizePhone(input); assert.ok(result.ok, `${input}: ${result.message}`); return result.e164; };
    const bad = (input) => { const result = phone.normalizePhone(input); assert.equal(result.ok, false, input); return result.message; };
    assert.equal(good("+55 (11) 99999-8888"), "+5511999998888");
    assert.equal(good("11999998888"), "+5511999998888", "national Brazilian input gets the DDI");
    assert.equal(good("+351 912 345 678"), "+351912345678");
    assert.equal(good("+1 415 555 2671"), "+14155552671");
    assert.match(bad("+55 00 99999-8888"), /DDD/);
    assert.match(bad("+55 11 89999-8888"), /começam com 9/);
    assert.match(bad("+55 11 9999-8888"), /DDD \+ 9 dígitos/);
    assert.match(bad("+999 123456789"), /DDI/);
    assert.match(bad("123"), /Telefone inválido/);
    assert.match(bad(""), /Informe/);
    assert.match(bad("+55 11 99999-8888 ramal 2"), /só pode ter números/);
    assert.equal(phone.maskPhone("+5511999998888"), "+55 •••••8888");
    assert.equal(phone.maskPhone("+14155552671"), "+1 •••••2671");
  }

  // ---- failures / redaction ----------------------------------------------------------
  {
    assert.equal(failures.retryAfterFor(1, MONDAY_9H).getTime() - MONDAY_9H.getTime(), 5 * 60_000);
    assert.equal(failures.retryAfterFor(2, MONDAY_9H).getTime() - MONDAY_9H.getTime(), 30 * 60_000);
    assert.equal(failures.retryAfterFor(3, MONDAY_9H), null);
    for (const secret of ["access_token=abc123secret", 'Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234', "EAABcdefghijklmnopqrstuvwxyz0123"]) {
      const cleaned = failures.redact(`erro ${secret} fim`);
      assert.ok(!/abc123secret|abcdefghijklmnopqrstuvwxyz|EAABcdefghijkl/.test(cleaned), cleaned);
    }
    assert.equal(failures.classifyCollectionError(new Error("fetch failed")).transient, true);
    assert.equal(failures.classifyCollectionError(new Error("qualquer outra coisa")).transient, false);
    assert.equal(failures.classifyCollectionError(new metaGraph.MetaGraphError("perm", 10)).code, "integration_permission");
  }

  // ---- static guards -----------------------------------------------------------------
  {
    const read = (file) => fs.readFileSync(file, "utf8");
    const code = (file) => read(file).replace(/\/\/.*$/gm, "");
    for (const file of ["lib/automations/executor.ts", "lib/automations/scheduler.ts", "lib/automations/run-store.ts", "lib/automations/runtime.ts", "app/api/cron/report-automations/route.ts", "app/api/projects/[clientId]/automations/[automationId]/run/route.ts"]) {
      assert.ok(!/published_snapshot|share_token\b(?!s)/.test(code(file).replace(/report_share_token/g, "")), `${file} must not touch the dashboard's publication`);
    }
    const cron = code("app/api/cron/report-automations/route.ts");
    assert.match(cron, /timingSafeEqual/, "the secret is compared in constant time");
    assert.match(cron, /if \(!env\.CRON_SECRET\)[\s\S]{0,120}503/, "closed when no secret is configured");
    assert.match(cron, /401/);
    assert.match(cron, /GET/);
    const env = code("lib/env.ts");
    for (const name of ["CRON_SECRET", "WHATSAPP_CLOUD_ACCESS_TOKEN", "WHATSAPP_CLOUD_PHONE_NUMBER_ID"]) {
      assert.ok(env.includes(name) && !env.includes(`NEXT_PUBLIC_${name}`), `${name} is server-only`);
    }
    // Only the provider talks to the WhatsApp endpoint; no client component imports it.
    const offenders = [];
    const walk = (folder) => {
      for (const entry of fs.readdirSync(folder, { withFileTypes: true })) {
        if (["node_modules", ".next", ".git"].includes(entry.name)) continue;
        const full = path.join(folder, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.(ts|tsx)$/.test(entry.name)) {
          const source = read(full);
          if (/\/messages["'`]/.test(source) && /graph\.facebook\.com/.test(source) && !full.endsWith(path.join("lib", "whatsapp", "cloud-api.ts")) && !full.includes("tests")) offenders.push(full);
          if (/^["']use client["']/.test(source.trim()) && /(WHATSAPP_CLOUD|CRON_SECRET|lib\/whatsapp\/(provider|cloud-api))/.test(source)) offenders.push(`${full} (client)`);
        }
      }
    };
    for (const folder of ["app", "components", "lib"]) walk(folder);
    assert.deepEqual(offenders, [], "WhatsApp is reached only through lib/whatsapp, server-side");
    // Meta collection for automations reuses the editor's collector (no second engine).
    assert.match(read("lib/projects/meta.ts"), /collectAnalysisForAutomation[\s\S]{0,200}collectWithCredentials/);
    assert.match(read("lib/projects/meta.ts"), /export async function collectAnalysis\([\s\S]{0,200}collectWithCredentials\(await credentials\(cid\)/);
    // The public run report uses ITS OWN function and only the run's snapshot.
    const migration = read("supabase/migrations/20260925120000_report_automation_executor.sql");
    const fn = migration.slice(migration.indexOf("create or replace function public.get_public_automation_report"), migration.indexOf("revoke all on function public.get_public_automation_report"));
    assert.match(fn, /report_snapshot/);
    assert.ok(!/published_snapshot|share_token\b/.test(fn.replace(/report_share_token/g, "")), "the run report never reads the dashboard's publication");
    assert.match(migration, /grant execute on function public\.get_public_automation_report\(uuid\) to anon/);
    assert.match(migration, /revoke all on function public\.get_public_automation_report\(uuid\) from public, anon, authenticated/);
    assert.match(migration, /create unique index agency_report_automation_runs_idempotency_key/);
    assert.ok(!/drop\s+(table|column)|truncate|delete\s+from/i.test(migration), "the migration is additive");
    // The public page reuses the clean report view.
    const page = read("app/report/run/[token]/page.tsx");
    assert.match(page, /ClientReportView/);
    assert.match(page, /loadAutomationRunReportByToken/);
    assert.match(page, /nocache: true/);
  }

  console.log("Report automation executor tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
