const ts = require("typescript");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const Module = require("node:module");

// Delivery status from the WhatsApp webhook: signature, parsing, storage and the
// rules that keep the endpoint from being forged.

const dir = fs.realpathSync(fs.mkdtempSync(path.join(os.tmpdir(), "laos-delivery-")));
const originalResolve = Module._resolveFilename;

async function main() {
  for (const file of ["lib/automations/delivery.ts", "lib/automations/delivery-store.ts", "lib/whatsapp/webhook.ts"]) {
    const output = path.join(dir, file.replace(/\.ts$/, ".js"));
    fs.mkdirSync(path.dirname(output), { recursive: true });
    fs.writeFileSync(output, ts.transpileModule(fs.readFileSync(file, "utf8"), {
      compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 },
    }).outputText);
  }
  Module._resolveFilename = function (request, ...args) {
    if (request.startsWith("@/")) {
      const target = path.join(dir, request.slice(2));
      return fs.existsSync(`${target}.js`) ? `${target}.js` : path.join(target, "index.js");
    }
    return originalResolve.call(this, request, ...args);
  };
  const load = (file) => require(path.join(dir, file));
  const delivery = load("lib/automations/delivery.js");
  const webhook = load("lib/whatsapp/webhook.js");
  const deliveryStore = load("lib/automations/delivery-store.js");

  // ---- signature -------------------------------------------------------------------
  const secret = "app-secret-for-tests";
  const body = JSON.stringify({ hello: "world" });
  const sign = (text, key = secret) => `sha256=${crypto.createHmac("sha256", key).update(text).digest("hex")}`;
  assert.equal(webhook.verifyMetaSignature(body, sign(body), secret), true);
  assert.equal(webhook.verifyMetaSignature(body + " ", sign(body), secret), false, "a changed body is rejected");
  assert.equal(webhook.verifyMetaSignature(body, sign(body, "another-secret"), secret), false, "wrong secret");
  assert.equal(webhook.verifyMetaSignature(body, null, secret), false, "missing header");
  assert.equal(webhook.verifyMetaSignature(body, sign(body).replace("sha256=", "sha1="), secret), false, "wrong scheme");
  assert.equal(webhook.verifyMetaSignature(body, "sha256=", secret), false);
  assert.equal(webhook.safeEqual("abc", "abc"), true);
  assert.equal(webhook.safeEqual("abc", "abd"), false);
  assert.equal(webhook.safeEqual("abc", "abcd"), false);

  // ---- parsing: the real payload Meta sent for the failed test message ----------------
  const failedPayload = {
    object: "whatsapp_business_account",
    entry: [{ id: "1356013163271479", changes: [{ field: "messages", value: {
      messaging_product: "whatsapp",
      metadata: { display_phone_number: "15551465946", phone_number_id: "1299403129924142" },
      statuses: [{
        id: "wamid.HBgNNTUxMTk3NTMyMTIwNxUCABEYEjcyMDVCODMzQTM1OTFDMjUwRAA=", status: "failed", timestamp: "1790280538",
        recipient_id: "5511975321207",
        errors: [{ code: 131000, title: "Something went wrong", message: "Something went wrong", error_data: { details: "Something went wrong." } }],
      }],
    } }] }],
  };
  const parsed = webhook.parseDeliveryStatuses(failedPayload);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0].status, "failed");
  assert.equal(parsed[0].errorCode, "131000");
  assert.match(parsed[0].errorMessage, /erro genérico da Meta/);
  assert.equal(parsed[0].occurredAt, new Date(1790280538 * 1000).toISOString());
  assert.ok(!JSON.stringify(parsed).includes("5511975321207"), "the recipient's number is not carried along");

  const mixed = webhook.parseDeliveryStatuses({ entry: [{ changes: [
    { value: { statuses: [{ id: "a", status: "sent", timestamp: "1790280000" }, { id: "a", status: "delivered", timestamp: "1790280010" }, { id: "b", status: "read", timestamp: "1790280020" }] } },
    { value: { messages: [{ from: "5511999998888", text: { body: "oi" } }] } }, // an incoming message: ignored
    { value: { statuses: [{ id: "c", status: "deleted" }, { status: "sent" }, { id: "", status: "sent" }, null, "x"] } },
  ] }, "garbage", null] });
  assert.deepEqual(mixed.map((item) => `${item.providerMessageId}:${item.status}`), ["a:sent", "a:delivered", "b:read"], "only known statuses of known messages");
  assert.equal(mixed[0].errorCode, null);
  assert.equal(mixed[0].errorMessage, null, "no error text unless failed");
  for (const junk of [null, undefined, 5, "x", {}, { entry: "x" }, { entry: [{ changes: "x" }] }]) assert.deepEqual(webhook.parseDeliveryStatuses(junk), []);

  // ---- summary and wording ----------------------------------------------------------
  const ev = (status, at, code = null, message = null) => ({ status, occurred_at: at, error_code: code, error_message: message });
  assert.equal(delivery.summarizeDelivery([]), null);
  assert.equal(delivery.summarizeDelivery([ev("delivered", "2026-09-24T10:00:01Z"), ev("sent", "2026-09-24T10:00:00Z")]).status, "delivered", "out-of-order events: the furthest wins");
  assert.equal(delivery.summarizeDelivery([ev("sent", "1"), ev("delivered", "2"), ev("read", "3")]).status, "read");
  const failed = delivery.summarizeDelivery([ev("sent", "1"), ev("failed", "2", "131047", "Fora da janela")]);
  assert.equal(failed.status, "failed");
  assert.equal(failed.error_message, "Fora da janela");
  assert.equal(delivery.summarizeDelivery([ev("delivered", "2")]).error_message, null);
  assert.match(delivery.describeDeliveryError(131047), /24 horas/);
  assert.match(delivery.describeDeliveryError("131030"), /lista de destinatários/);
  assert.match(delivery.describeDeliveryError(131042), /pagamento/);
  assert.match(delivery.describeDeliveryError(999999, "Some title"), /Some title/, "unknown codes keep the provider's title");
  assert.match(delivery.describeDeliveryError(null), /não entregou/);
  assert.equal(delivery.DELIVERY_LABELS.delivered, "Entregue");

  // ---- storage ----------------------------------------------------------------------
  const calls = [];
  const admin = {
    from(table) {
      const call = { table };
      calls.push(call);
      const q = {
        select() { return q; },
        in(key, values) { call.in = [key, values]; return q; },
        upsert(rows, options) { call.upsert = { rows, options }; return Promise.resolve({ error: null }); },
        then(resolve) { return Promise.resolve({ data: [{ id: "run-1", client_id: "client-1", provider_message_id: "known" }], error: null }).then(resolve); },
      };
      return q;
    },
  };
  const statuses = (id, status) => ({ providerMessageId: id, status, occurredAt: "2026-09-24T10:00:00.000Z", errorCode: null, errorMessage: null });
  const result = await deliveryStore.recordDeliveryStatuses(admin, [statuses("known", "sent"), statuses("known", "delivered"), statuses("someone-elses-message", "sent")]);
  assert.deepEqual(result, { received: 3, stored: 2 }, "statuses of messages this app did not send are dropped");
  const upsert = calls.find((call) => call.upsert).upsert;
  assert.equal(upsert.rows.length, 2);
  assert.ok(upsert.rows.every((row) => row.run_id === "run-1" && row.client_id === "client-1"));
  assert.deepEqual(upsert.options, { onConflict: "provider_message_id,status", ignoreDuplicates: true }, "a redelivered webhook stores nothing twice");
  assert.deepEqual(await deliveryStore.recordDeliveryStatuses(admin, []), { received: 0, stored: 0 });
  const none = await deliveryStore.recordDeliveryStatuses(admin, [statuses("unknown", "sent")]);
  assert.deepEqual(none, { received: 1, stored: 0 });

  const summariesDb = {
    from() {
      const q = { select() { return q; }, in() { return q; }, then(resolve) { return Promise.resolve({ data: [
        { run_id: "r1", status: "sent", occurred_at: "1", error_code: null, error_message: null },
        { run_id: "r1", status: "failed", occurred_at: "2", error_code: "131047", error_message: "janela" },
        { run_id: "r2", status: "delivered", occurred_at: "3", error_code: null, error_message: null },
      ], error: null }).then(resolve); } };
      return q;
    },
  };
  const summaries = await deliveryStore.listDeliverySummaries(summariesDb, ["r1", "r2", "r3"]);
  assert.equal(summaries.get("r1").status, "failed");
  assert.equal(summaries.get("r2").status, "delivered");
  assert.equal(summaries.has("r3"), false);
  const brokenDb = { from() { const q = { select() { return q; }, in() { return q; }, then(resolve) { return Promise.resolve({ data: null, error: { code: "x" } }).then(resolve); } }; return q; } };
  assert.equal((await deliveryStore.listDeliverySummaries(brokenDb, ["r1"])).size, 0, "a delivery lookup failure never breaks the history");

  // ---- static guards -----------------------------------------------------------------
  const read = (file) => fs.readFileSync(file, "utf8");
  const code = (file) => read(file).replace(/\/\/.*$/gm, "");
  const route = code("app/api/webhooks/whatsapp/route.ts");
  assert.match(route, /if \(!expected\)[\s\S]{0,120}503/, "GET is closed without a verify token");
  assert.match(route, /safeEqual\(params\.get\("hub\.verify_token"\)/, "the verify token is compared in constant time");
  assert.match(route, /hub\.challenge/);
  assert.match(route, /if \(!secret\)[\s\S]{0,120}503/, "POST is closed without the app secret");
  assert.match(route, /verifyMetaSignature\(raw, request\.headers\.get\("x-hub-signature-256"\), secret\)[\s\S]{0,140}401/, "unsigned POSTs are rejected");
  assert.ok(route.indexOf("verifyMetaSignature") < route.indexOf("JSON.parse"), "the signature is checked before the body is parsed");
  assert.ok(!/recipient_id|wa_id|message_text|access_token/i.test(route), "the webhook logs no numbers, texts or tokens");
  const env = code("lib/env.ts");
  for (const name of ["WHATSAPP_WEBHOOK_VERIFY_TOKEN", "WHATSAPP_APP_SECRET"]) assert.ok(env.includes(name) && !env.includes(`NEXT_PUBLIC_${name}`), `${name} is server-only`);
  const migration = read("supabase/migrations/20260925140000_whatsapp_delivery_events.sql");
  assert.match(migration, /enable row level security/);
  assert.match(migration, /revoke all on public\.agency_report_automation_delivery_events from public, anon, authenticated/);
  assert.match(migration, /grant select on public\.agency_report_automation_delivery_events to authenticated/);
  assert.ok(!/grant[^;]*(insert|update|delete)[^;]*to (anon|authenticated)/i.test(migration), "browsers cannot write delivery events");
  assert.ok(!/to anon/i.test(migration), "anon has no access");
  assert.match(migration, /unique \(provider_message_id, status\)/);
  assert.ok(!/drop\s+(table|column)|truncate|delete\s+from/i.test(migration), "the migration is additive");

  console.log("WhatsApp delivery status tests passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
}).finally(() => fs.rmSync(dir, { recursive: true, force: true }));
