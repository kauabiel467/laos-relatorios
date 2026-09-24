const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const Module = require("node:module");

const dir = fs.mkdtempSync(path.join(os.tmpdir(), "laos-automations-"));
const originalResolve = Module._resolveFilename;

function fakeDb() {
  const calls = [];
  const db = {
    calls,
    failNext: null,
    from(table) {
      const call = { table, filters: [], op: "select" };
      calls.push(call);
      const error = db.failNext;
      db.failNext = null;
      const query = {
        select() { return query; },
        insert(values) { call.op = "insert"; call.values = values; return query; },
        update(values) { call.op = "update"; call.values = values; return query; },
        eq(key, value) { call.filters.push([key, value]); return query; },
        order() { return query; },
        limit() { return query; },
        async single() { return error ? { data: null, error } : { data: { id: "row", client_id: "client-1", ...call.values }, error: null }; },
      };
      return query;
    },
  };
  return db;
}

async function main() {
  for (const file of [
    "lib/metrics/catalog.ts", "lib/metrics/dates.ts",
    "lib/report-templates/index.ts", "lib/report-templates/from-analysis.ts",
    ...["periods", "schedule", "model", "engine", "store"].map((name) => `lib/automations/${name}.ts`),
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
      // Directory imports (e.g. "@/lib/report-templates") resolve to their index, like in Next.
      return fs.existsSync(`${target}.js`) ? `${target}.js` : path.join(target, "index.js");
    }
    return originalResolve.call(this, request, ...args);
  };
  const load = (file) => require(path.join(dir, file));
  const periods = load("lib/automations/periods.js");
  const schedule = load("lib/automations/schedule.js");
  const model = load("lib/automations/model.js");
  const engine = load("lib/automations/engine.js");
  const store = load("lib/automations/store.js");
  const templates = load("lib/report-templates/index.js");
  const dates = load("lib/metrics/dates.js");

  const SP = "America/Sao_Paulo";
  // Noon local time keeps these cases independent of any timezone edge.
  const at = (day, tz = SP) => {
    const [y, m, d] = day.split("-").map(Number);
    const noonUtc = Date.UTC(y, m - 1, d, 12);
    return new Date(noonUtc + (tz === SP ? 3 : 0) * 3_600_000);
  };
  const period = (preset, day, comparisonEnabled = true, tz = SP) =>
    periods.resolveAutomationPeriod(preset, { now: at(day, tz), timezone: tz, comparisonEnabled });
  const range = (p) => `${p.since}..${p.until}`;

  // ---- weekday sanity (the fixtures below assume these) ----------------------------
  assert.equal(periods.isoWeekday("2026-09-21"), 1, "21/09/2026 is a Monday");
  assert.equal(periods.isoWeekday("2026-09-27"), 7, "27/09/2026 is a Sunday");
  assert.equal(periods.isoWeekday("2028-02-29"), 2);

  // ---- monday_thursday: every day of the week ------------------------------------------
  const mondayThursday = {
    "2026-09-21": "2026-09-14..2026-09-17", // Monday: nothing of this week is complete
    "2026-09-22": "2026-09-14..2026-09-17",
    "2026-09-23": "2026-09-14..2026-09-17",
    "2026-09-24": "2026-09-14..2026-09-17", // Thursday itself is not over yet
    "2026-09-25": "2026-09-21..2026-09-24", // Friday: Monday..Thursday of the SAME week
    "2026-09-26": "2026-09-21..2026-09-24",
    "2026-09-27": "2026-09-21..2026-09-24",
    "2026-09-28": "2026-09-21..2026-09-24",
  };
  for (const [day, expected] of Object.entries(mondayThursday)) {
    assert.equal(range(period("monday_thursday", day)), expected, `monday_thursday run on ${day}`);
  }

  // ---- friday_sunday ------------------------------------------------------------------------
  const fridaySunday = {
    "2026-09-21": "2026-09-18..2026-09-20", // Monday: the Friday..Sunday that just ended
    "2026-09-22": "2026-09-18..2026-09-20",
    "2026-09-25": "2026-09-18..2026-09-20", // Friday: this weekend has not happened yet
    "2026-09-26": "2026-09-18..2026-09-20",
    "2026-09-27": "2026-09-18..2026-09-20", // Sunday itself is not over yet
    "2026-09-28": "2026-09-25..2026-09-27",
  };
  for (const [day, expected] of Object.entries(fridaySunday)) {
    assert.equal(range(period("friday_sunday", day)), expected, `friday_sunday run on ${day}`);
  }

  // ---- monday_sunday -------------------------------------------------------------------------
  const mondaySunday = {
    "2026-09-21": "2026-09-14..2026-09-20", // Monday: last complete week
    "2026-09-24": "2026-09-14..2026-09-20",
    "2026-09-27": "2026-09-14..2026-09-20", // Sunday itself is not over yet
    "2026-09-28": "2026-09-21..2026-09-27",
  };
  for (const [day, expected] of Object.entries(mondaySunday)) {
    assert.equal(range(period("monday_sunday", day)), expected, `monday_sunday run on ${day}`);
  }

  // A block is always exactly its own length and always starts/ends on its weekdays,
  // whatever the run date is (this is what "not the last N days" means).
  for (const preset of periods.AUTOMATION_PERIOD_PRESETS) {
    const definition = periods.AUTOMATION_PERIOD_DEFINITIONS[preset];
    for (let offset = 0; offset < 60; offset += 1) {
      const day = dates.addDays("2026-08-01", offset);
      const result = period(preset, day);
      assert.equal(periods.isoWeekday(result.since), definition.startDay, `${preset} ${day} starts on the right weekday`);
      assert.equal(dates.daysInclusive(result.since, result.until), definition.length, `${preset} ${day} has the right length`);
      assert.ok(result.until < result.runDate, `${preset} ${day} only reports days that are already over`);
    }
  }

  // ---- comparison: the same block one week earlier ------------------------------------------
  const cases = [
    ["monday_thursday", "2026-09-25", "2026-09-21..2026-09-24", "2026-09-14..2026-09-17"],
    ["friday_sunday", "2026-09-21", "2026-09-18..2026-09-20", "2026-09-11..2026-09-13"],
    ["monday_sunday", "2026-09-21", "2026-09-14..2026-09-20", "2026-09-07..2026-09-13"],
  ];
  for (const [preset, day, current, compared] of cases) {
    const result = period(preset, day);
    assert.equal(range(result), current);
    assert.equal(`${result.compareSince}..${result.compareUntil}`, compared, `${preset} compares with the equivalent block of the previous week`);
    // ...which is not "the N days right before" whenever the block is shorter than a week.
    const immediately = dates.previousDateRange(result.since, result.until);
    const immediateRange = `${immediately.since}..${immediately.until}`;
    if (preset === "monday_sunday") assert.equal(compared, immediateRange, "for a full week both readings coincide");
    else assert.notEqual(compared, immediateRange, `${preset} must keep the same weekdays, not the adjacent days`);
  }
  const disabled = period("monday_thursday", "2026-09-25", false);
  assert.equal(disabled.compareSince, null);
  assert.equal(disabled.compareUntil, null);
  assert.deepEqual(periods.equivalentPreviousWeek({ since: "2026-03-02", until: "2026-03-05" }), { since: "2026-02-23", until: "2026-02-26" });

  // ---- month, year and February boundaries -----------------------------------------------------
  assert.equal(range(period("friday_sunday", "2026-10-05")), "2026-10-02..2026-10-04");
  assert.equal(range(period("monday_sunday", "2026-11-02")), "2026-10-26..2026-11-01", "block spanning two months");
  const newYear = period("monday_sunday", "2027-01-04");
  assert.equal(range(newYear), "2026-12-28..2027-01-03", "block spanning two years");
  assert.equal(`${newYear.compareSince}..${newYear.compareUntil}`, "2026-12-21..2026-12-27");
  assert.equal(periods.isoWeekday("2027-01-01"), 5, "01/01/2027 is a Friday");
  assert.equal(range(period("friday_sunday", "2027-01-04")), "2027-01-01..2027-01-03");
  assert.equal(range(period("friday_sunday", "2026-12-28")), "2026-12-25..2026-12-27", "Friday..Sunday across Christmas");
  assert.equal(range(period("monday_sunday", "2026-03-02")), "2026-02-23..2026-03-01", "February 2026 (28 days)");
  const leap = period("monday_sunday", "2028-03-06");
  assert.equal(range(leap), "2028-02-28..2028-03-05", "February 2028 includes the 29th");
  assert.equal(dates.daysInclusive(leap.since, leap.until), 7);
  const leapThursday = period("monday_thursday", "2028-03-03");
  assert.equal(range(leapThursday), "2028-02-28..2028-03-02");
  assert.equal(dates.daysInclusive(leapThursday.since, leapThursday.until), 4, "the leap day counts as a day of the block");
  assert.equal(`${leapThursday.compareSince}..${leapThursday.compareUntil}`, "2028-02-21..2028-02-24");

  // ---- timezone -----------------------------------------------------------------------------------
  // 01:00 UTC on Monday 28/09 is still Sunday 22:00 in São Paulo: the week is not over.
  const sundayNightInSaoPaulo = new Date("2026-09-28T01:00:00Z");
  assert.equal(range(periods.resolveAutomationPeriod("monday_sunday", { now: sundayNightInSaoPaulo, timezone: SP })), "2026-09-14..2026-09-20");
  assert.equal(periods.resolveAutomationPeriod("monday_sunday", { now: sundayNightInSaoPaulo, timezone: SP }).runDate, "2026-09-27");
  // The very same instant is already Monday in UTC, where the week HAS ended.
  assert.equal(range(periods.resolveAutomationPeriod("monday_sunday", { now: sundayNightInSaoPaulo, timezone: "UTC" })), "2026-09-21..2026-09-27");
  // And ahead of UTC: 20:00 UTC Sunday is already Monday 05:00 in Tokyo.
  const mondayMorningInTokyo = new Date("2026-09-27T20:00:00Z");
  assert.equal(range(periods.resolveAutomationPeriod("monday_sunday", { now: mondayMorningInTokyo, timezone: "Asia/Tokyo" })), "2026-09-21..2026-09-27");
  assert.equal(range(periods.resolveAutomationPeriod("monday_sunday", { now: mondayMorningInTokyo, timezone: "UTC" })), "2026-09-14..2026-09-20");
  assert.throws(() => periods.resolveAutomationPeriod("monday_sunday", { now: new Date(), timezone: "Mars/Olympus" }), /Fuso horário inválido/);
  assert.throws(() => periods.resolveAutomationPeriod("last_7d", { now: new Date(), timezone: SP }), /inválido/);

  // Timezone priority: project, then integration, then America/Sao_Paulo.
  assert.equal(periods.resolveAutomationTimezone({ projectTimezone: "America/Manaus", integrationTimezone: "America/Bahia" }), "America/Manaus");
  assert.equal(periods.resolveAutomationTimezone({ projectTimezone: null, integrationTimezone: "America/Bahia" }), "America/Bahia");
  assert.equal(periods.resolveAutomationTimezone({ projectTimezone: "not/a-zone", integrationTimezone: "America/Bahia" }), "America/Bahia");
  assert.equal(periods.resolveAutomationTimezone({ projectTimezone: "", integrationTimezone: undefined }), "America/Sao_Paulo");
  assert.equal(periods.resolveAutomationTimezone({}), "America/Sao_Paulo");
  assert.equal(periods.isValidTimezone("Mars/Olympus"), false);
  assert.equal(periods.isValidTimezone("UTC"), true);

  // ---- next run (schedule only; nothing executes) ------------------------------------------------------
  const monday9 = { runWeekday: 1, runTime: "09:00", timezone: SP };
  assert.equal(schedule.nextRunAt(monday9, new Date("2026-09-25T18:00:00Z")).toISOString(), "2026-09-28T12:00:00.000Z", "Monday 09:00 in São Paulo is 12:00 UTC");
  assert.equal(schedule.nextRunAt(monday9, new Date("2026-09-28T11:00:00Z")).toISOString(), "2026-09-28T12:00:00.000Z", "still earlier the same Monday");
  assert.equal(schedule.nextRunAt(monday9, new Date("2026-09-28T12:00:00Z")).toISOString(), "2026-10-05T12:00:00.000Z", "strictly after 'now'");
  // 01:00 UTC on Monday is still Sunday night in São Paulo, so the next Monday 09:00 is that same day.
  assert.equal(schedule.nextRunAt(monday9, new Date("2026-09-28T01:00:00Z")).toISOString(), "2026-09-28T12:00:00.000Z");
  const newYorkFriday = { runWeekday: 5, runTime: "17:30", timezone: "America/New_York" };
  assert.equal(schedule.nextRunAt(newYorkFriday, new Date("2026-10-26T00:00:00Z")).toISOString(), "2026-10-30T21:30:00.000Z", "EDT is UTC-4");
  assert.equal(schedule.nextRunAt(newYorkFriday, new Date("2026-11-02T00:00:00Z")).toISOString(), "2026-11-06T22:30:00.000Z", "EST is UTC-5 after daylight saving ends");
  assert.throws(() => schedule.nextRunAt({ ...monday9, runTime: "25:00" }), /Horário inválido/);

  // ---- model ------------------------------------------------------------------------------------------------
  assert.deepEqual([...model.AUTOMATION_MESSAGE_TEMPLATES], templates.REPORT_MESSAGE_TEMPLATES.map((template) => template.id), "automations use exactly the templates of Copiar relatório");
  const docId = "aecc0000-0000-4000-8000-0000000000d1";
  const valid = {
    name: "Rotina", document_id: docId, message_template: "sales", period_preset: "friday_sunday",
    run_weekday: 1, run_time: "09:00", timezone: SP,
    recipient: { type: "phone", phone: "+5511999999999", display_name: "Fresh Burguer" },
  };
  const parsed = model.automationInputSchema.parse(valid);
  assert.equal(parsed.comparison_enabled, true);
  assert.equal(parsed.include_detailed_report, false);
  assert.equal(parsed.status, "paused", "new automations start paused");
  assert.equal(parsed.channel, "whatsapp");
  assert.equal(parsed.frequency, "weekly");
  for (const bad of [
    { ...valid, name: "   " }, { ...valid, period_preset: "last_7d" }, { ...valid, run_weekday: 8 },
    { ...valid, run_time: "9h" }, { ...valid, timezone: "Mars/Olympus" }, { ...valid, message_template: "custom" },
    { ...valid, recipient: { type: "phone", phone: "11999999999" } },
    { ...valid, recipient: { type: "phone", phone: "+5511999999999", token: "EAAB-secret" } },
    { ...valid, recipient: { type: "group", group_id: "g1", api_key: "secret" } },
    { ...valid, document_id: "not-a-uuid" },
  ]) assert.throws(() => model.automationInputSchema.parse(bad));
  assert.equal(model.automationInputSchema.parse({ ...valid, recipient: { type: "group", group_id: "120363@g.us" } }).recipient.type, "group");

  // Several related automations per project: the two halves of the LAOS routine, or a single weekly one.
  const base = { document_id: docId, message_template: "sales", comparison_enabled: true, include_detailed_report: true, frequency: "weekly", run_time: "09:00", timezone: SP, channel: "whatsapp", recipient: valid.recipient, status: "paused" };
  const routine = model.buildRoutineAutomations("rotina_laos", base);
  assert.equal(routine.length, 2);
  assert.deepEqual(routine.map((item) => [item.run_weekday, item.period_preset]), [[1, "friday_sunday"], [5, "monday_thursday"]]);
  assert.equal(new Set(routine.map((item) => item.name)).size, 2, "names must be unique within a project");
  assert.ok(routine.every((item) => item.routine_key === "rotina_laos"));
  const weekly = model.buildRoutineAutomations("semanal_completo", base);
  assert.deepEqual(weekly.map((item) => [item.run_weekday, item.period_preset]), [[1, "monday_sunday"]]);
  // A routine really produces the periods it promises: Monday reports the weekend, Friday the Mon-Thu block.
  assert.equal(range(period(routine[0].period_preset, "2026-09-28")), "2026-09-25..2026-09-27");
  assert.equal(range(period(routine[1].period_preset, "2026-09-25")), "2026-09-21..2026-09-24");

  // ---- engine -----------------------------------------------------------------------------------------------------
  const automation = { id: "auto-1", client_id: "client-1", document_id: docId, message_template: "sales", period_preset: "friday_sunday", comparison_enabled: true, include_detailed_report: true, timezone: SP };
  const now = new Date("2026-09-28T12:00:00Z"); // Monday 09:00 in São Paulo
  const plan = engine.planAutomationRun(automation, { now });
  assert.equal(plan.period.since, "2026-09-25");
  assert.equal(plan.period.until, "2026-09-27");
  assert.equal(plan.period.compareSince, "2026-09-18");
  assert.equal(plan.period.compareUntil, "2026-09-20");
  assert.equal(plan.attempt, 1);
  // A retry keeps the period even if it happens after the week rolled over.
  const retry = engine.retryPlan(plan);
  assert.equal(retry.attempt, 2);
  assert.deepEqual(retry.period, plan.period);
  assert.notDeepEqual(engine.planAutomationRun(automation, { now: new Date("2026-10-05T12:00:00Z") }).period, plan.period);

  const record = engine.newRunRecord(plan);
  assert.equal(record.status, "scheduled");
  assert.equal(record.period_since, "2026-09-25");
  assert.equal(record.compare_since, "2026-09-18");
  assert.equal(record.timezone, SP);
  assert.equal(record.period_preset, "friday_sunday");
  assert.deepEqual(engine.newRunRecord(engine.planAutomationRun({ ...automation, comparison_enabled: false }, { now })).compare_since, null);

  // The config handed to the collector is valid for the existing period rules.
  const dashboardConfig = { preset: "last_30d", since: "2026-08-01", until: "2026-08-31", comparison: "previous", campaign_ids: [], metrics: ["spend", "purchases", "revenue", "roas"], sections: ["metrics"], subtitle: "", analysis: "", template: "sales", primary_metric: "purchases" };
  const runConfig = engine.analysisConfigForRun(dashboardConfig, plan);
  assert.equal(runConfig.preset, "custom");
  assert.equal(runConfig.comparison, "custom");
  assert.deepEqual(runConfig.metrics, dashboardConfig.metrics, "everything else in the dashboard config is kept");
  assert.doesNotThrow(() => dates.resolvePeriod("custom", SP, { since: runConfig.since, until: runConfig.until }, runConfig.comparison, { since: runConfig.compare_since, until: runConfig.compare_until }, now));
  const noComparison = engine.analysisConfigForRun(dashboardConfig, engine.planAutomationRun({ ...automation, comparison_enabled: false }, { now }));
  assert.equal(noComparison.comparison, "none");
  assert.equal(noComparison.compare_since, undefined);

  // Message: produced by the template code shared with "Copiar relatório".
  const empty = Object.fromEntries(["spend", "impressions", "reach", "clicks", "link_clicks", "ctr", "cpc", "cpm", "frequency", "purchases", "revenue", "roas", "cpa", "messages", "cost_message", "leads", "cpl", "landing_views", "checkouts", "profile_visits", "followers", "engagements"].map((metric) => [metric, null]));
  const data = { currency: "BRL", timezone: SP, warnings: [], updated_at: "x", daily: [], campaigns: [], adsets: [], ads: [], platforms: [], audience: [],
    current: { ...empty, spend: 600, reach: 9000, purchases: 12, revenue: 2400, roas: 4, cpa: 50 },
    previous: { ...empty, spend: 500, purchases: 8 } };
  const message = engine.buildRunMessage(plan, { clientName: "Fresh Burguer", config: dashboardConfig, data });
  assert.equal(message.ok, true);
  const direct = templates.buildReportMessage("sales", require(path.join(dir, "lib/report-templates/from-analysis.js")).reportMessageInputFromAnalysis({
    clientName: "Fresh Burguer", data, period: plan.period, primaryMetric: "purchases", metrics: dashboardConfig.metrics, comparisonEnabled: true,
  }));
  assert.equal(message.text, direct, "the automation and the copy button produce byte-identical text");
  assert.match(message.text, /^\*Fresh Burguer\*\n\nSegue o relatório do período:\n📆 \(25\/09 a 27\/09\)/);
  assert.match(message.text, /\*CAMPANHA DE VENDAS:\*/);
  assert.equal(engine.buildRunMessage({ ...plan, messageTemplate: "traffic" }, { clientName: "X", config: dashboardConfig, data }).ok, false, "a template with no data to report is skipped, not faked");

  // The detailed snapshot is an independent, frozen copy.
  const source = { current: { spend: 1 }, nested: { list: [1, 2] } };
  const snapshot = engine.buildRunSnapshot("Vendas", dashboardConfig, source);
  source.current.spend = 999;
  source.nested.list.push(3);
  assert.equal(snapshot.data.current.spend, 1, "later changes to the dashboard never reach a stored run");
  assert.deepEqual(snapshot.data.nested.list, [1, 2]);
  assert.deepEqual(Object.keys(snapshot).sort(), ["config", "data", "title"]);

  // Run status machine (mirrors the database trigger).
  for (const [from, to, allowed] of [
    ["scheduled", "running", true], ["scheduled", "skipped", true], ["running", "sent", true], ["running", "failed", true],
    ["running", "scheduled", false], ["sent", "failed", false], ["failed", "running", false], ["skipped", "sent", false], ["scheduled", "sent", false],
  ]) assert.equal(engine.canTransitionRun(from, to), allowed, `${from} -> ${to}`);
  assert.deepEqual(["sent", "failed", "skipped"].map(engine.isTerminalRunStatus), [true, true, true]);
  assert.equal(engine.isTerminalRunStatus("running"), false);

  // ---- store ------------------------------------------------------------------------------------------------------
  const db = fakeDb();
  const created = await store.createAutomation(db, "client-1", "user-1", { ...parsed, status: "active" }, new Date("2026-09-25T18:00:00Z"));
  const insert = db.calls[0];
  assert.equal(insert.table, "agency_report_automations");
  assert.equal(insert.values.created_by, "user-1");
  assert.equal(insert.values.next_run_at, "2026-09-28T12:00:00.000Z", "active automations get their next run stored");
  assert.equal(created.status, "active");
  await store.createAutomation(db, "client-1", "user-1", parsed, new Date("2026-09-25T18:00:00Z"));
  assert.equal(db.calls[1].values.next_run_at, null, "paused automations have no next run");
  const paused = { ...created, status: "paused" };
  await store.setAutomationStatus(db, paused, "active", new Date("2026-09-25T18:00:00Z"));
  assert.equal(db.calls[2].values.next_run_at, "2026-09-28T12:00:00.000Z");
  assert.deepEqual(db.calls[2].filters, [["id", "row"], ["client_id", "client-1"]]);
  await store.setAutomationStatus(db, { ...created }, "paused");
  assert.equal(db.calls[3].values.next_run_at, null);
  // Errors are turned into messages people can act on.
  db.failNext = { code: "23505" };
  await assert.rejects(store.createAutomation(db, "client-1", "user-1", parsed), /Já existe uma automação com esse nome/);
  db.failNext = { code: "P0001", message: "A automação precisa estar ligada a um dashboard." };
  await assert.rejects(store.createAutomation(db, "client-1", "user-1", parsed), /precisa estar ligada a um dashboard/);
  db.failNext = { code: "XX000", message: "internal detail" };
  await assert.rejects(store.createAutomation(db, "client-1", "user-1", parsed), (error) => error.message === "Não foi possível criar a automação." && !/internal/.test(error.message));

  // ---- migration <-> code consistency ---------------------------------------------------------------------------------
  const sql = fs.readFileSync("supabase/migrations/20260924120000_report_automations.sql", "utf8");
  const list = (text) => text.split(",").map((item) => item.trim().replace(/^'|'$/g, "")).filter(Boolean);
  const checkList = (column) => list(new RegExp(`${column} text not null check \\(${column} in \\(([^)]*)\\)`).exec(sql)[1]);
  assert.deepEqual(checkList("period_preset"), [...periods.AUTOMATION_PERIOD_PRESETS]);
  assert.deepEqual(checkList("message_template"), [...model.AUTOMATION_MESSAGE_TEMPLATES]);
  assert.deepEqual(list(/status text not null default 'paused' check \(status in \(([^)]*)\)/.exec(sql)[1]), [...model.AUTOMATION_STATUSES]);
  assert.deepEqual(list(/status text not null default 'scheduled' check \(status in \(([^)]*)\)/.exec(sql)[1]), [...model.AUTOMATION_RUN_STATUSES]);
  const insertGrant = list(/grant insert \(([^)]*)\)/.exec(sql)[1].replace(/\s+/g, " "));
  const updateGrant = list(/grant update \(([^)]*)\)/.exec(sql)[1].replace(/\s+/g, " "));
  for (const key of Object.keys(insert.values)) assert.ok(insertGrant.includes(key), `insert column ${key} must be granted`);
  for (const key of Object.keys(db.calls[2].values)) assert.ok(updateGrant.includes(key), `update column ${key} must be granted`);
  assert.ok(!insertGrant.includes("last_run_at") && !updateGrant.includes("last_run_at"), "last_run_at belongs to the engine");
  assert.match(sql, /alter table public\.agency_report_automations enable row level security/);
  assert.match(sql, /alter table public\.agency_report_automation_runs enable row level security/);
  assert.doesNotMatch(sql, /to anon/i, "nothing here is granted to anon");
  assert.doesNotMatch(sql, /grant (insert|update|delete)[^;]*agency_report_automation_runs[^;]*to authenticated/is, "run history is not writable from the browser");
  assert.match(sql, /'token'.*'secret'.*'password'/s, "the recipient column rejects obvious credentials");
  assert.match(sql, /report_share_token uuid unique/);
  const executableSql = sql.replace(/--.*$/gm, "").replace(/comment on [^;]*;/gs, "");
  assert.doesNotMatch(executableSql, /published_snapshot/, "automation history never borrows the dashboard's published_snapshot");
  // Templates for the message must not be re-implemented inside the automation code.
  for (const file of ["periods", "schedule", "model", "engine", "store"]) {
    assert.doesNotMatch(fs.readFileSync(`lib/automations/${file}.ts`, "utf8"), /Segue o relatório do período/, `${file}.ts must not carry its own message template`);
  }
  assert.match(fs.readFileSync("components/projects/analysis-view.tsx", "utf8"), /reportMessageInputFromAnalysis/, "the copy button uses the shared mapping");
  assert.match(fs.readFileSync("lib/automations/engine.ts", "utf8"), /reportMessageInputFromAnalysis/);

  console.log("PASS: períodos operacionais (seg-qui, sex-dom, seg-dom), comparação semanal, timezone, agenda, motor, histórico imutável e consistência com a migration");
}

main().finally(() => {
  Module._resolveFilename = originalResolve;
  fs.rmSync(dir, { recursive: true, force: true });
});
