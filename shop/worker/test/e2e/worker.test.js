'use strict';
// The Worker itself, end to end: the real bundle in Cloudflare's local runtime
// (workerd, started by `wrangler dev`), against the Auth and Database emulators
// and a stand-in for the provider's API on a local port. This covers what a
// deploy depends on and the other suites can't reach: the bundling, the secrets
// and settings as the runtime hands them over, fetch() to the database and the
// provider, and WebCrypto for the webhook signature.
const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { SKIP, DB_HOST, AUTH_HOST, PROJECT, dbFor, anonUser, passwordUser } = require('../helpers/emu');
const { signedBody } = require('../helpers/fake-stripe');
const { STRIPE_API_VERSION } = require('../../src/config');
const { E2E } = require('./secrets');
const E = require('../helpers/events');

const WORKER_DIR = path.join(__dirname, '..', '..');
const NS = 'demo-pi-e2e-default-rtdb';
const SITE = 'https://pointinvaders.com';

/** The provider's API, played back on a local port: prices, sessions, nothing else. */
function fakeProvider(){
  const seen = [];
  const sessions = new Map();
  let n = 0;
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', c => { body += c; });
    req.on('end', () => {
      const url = new URL(req.url, 'http://fake');
      seen.push({ method: req.method, path: url.pathname, query: url.searchParams, form: new URLSearchParams(body), headers: req.headers });
      const send = (status, obj) => { res.writeHead(status, { 'content-type': 'application/json' }); res.end(JSON.stringify(obj)); };
      if(req.method === 'GET' && url.pathname === '/v1/prices'){
        const key = url.searchParams.get('lookup_keys[0]');
        return send(200, { object: 'list', data: [{ id: 'price_' + key, object: 'price', lookup_key: key, active: true }] });
      }
      if(req.method === 'POST' && url.pathname === '/v1/checkout/sessions'){
        const f = new URLSearchParams(body);
        const id = `cs_test_e2e${++n}`;
        const s = { id, object: 'checkout.session', url: `https://checkout.stripe.com/c/pay/${id}`, status: 'open',
                    expires_at: Number(f.get('expires_at')), client_reference_id: f.get('client_reference_id') };
        sessions.set(id, s);
        return send(200, s);
      }
      const m = /^\/v1\/checkout\/sessions\/([^/]+)$/.exec(url.pathname);
      if(req.method === 'GET' && m && sessions.has(m[1])) return send(200, sessions.get(m[1]));
      return send(404, { error: { type: 'invalid_request_error', code: 'resource_missing', message: 'not in the fake' } });
    });
  });
  return { server, seen };
}

const listen = server => new Promise(r => server.listen(0, '127.0.0.1', () => r(server.address().port)));
async function freePort(){
  const s = http.createServer();
  const port = await listen(s);
  await new Promise(r => s.close(r));
  return port;
}

/** `wrangler dev` with the test settings; its own process group, so it can be stopped whole. */
function startWorker(port, providerPort){
  const vars = {
    FIREBASE_DATABASE_EMULATOR_HOST: DB_HOST, FIREBASE_AUTH_EMULATOR_HOST: AUTH_HOST, DATABASE_NS: NS,
    PROJECT_ID: PROJECT, STRIPE_API_BASE: `http://127.0.0.1:${providerPort}`
  };
  const args = ['wrangler', 'dev', '--port', String(port), '--ip', '127.0.0.1', '--show-interactive-dev-session=false',
                ...Object.entries(vars).flatMap(([k, v]) => ['--var', `${k}:${v}`])];
  const child = spawn('npx', args, { cwd: WORKER_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'],
                                     env: { ...process.env, CI: '1', WRANGLER_SEND_METRICS: 'false' } });
  let out = '';
  child.stdout.on('data', d => { out += d; });
  child.stderr.on('data', d => { out += d; });
  return { child, output: () => out };
}

async function waitReady(base, output, ms = 90_000){
  const until = Date.now() + ms;
  let last = null;
  while(Date.now() < until){
    try{
      const r = await fetch(base + '/health');
      last = await r.json();
      if(r.status === 200) return last;
    }catch(e){ /* not listening yet */ }
    await new Promise(r => setTimeout(r, 300));
  }
  throw new Error(`the Worker did not become healthy (last: ${JSON.stringify(last)}):\n${output().slice(-3000)}`);
}

test('the Worker, end to end', { skip: SKIP, concurrency: false, timeout: 240_000 }, async t => {
  const provider = fakeProvider();
  const providerPort = await listen(provider.server);
  const port = await freePort();
  const A = dbFor(NS);
  await A.clear();
  const w = startWorker(port, providerPort);
  t.after(() => {
    try{ process.kill(-w.child.pid, 'SIGKILL'); }catch(e){ /* already gone */ }
    provider.server.close();
  });
  const base = `http://127.0.0.1:${port}`;
  const first = await waitReady(base, w.output);
  const secretsUsed = [];
  const post = (body, { token, origin = SITE } = {}) => {
    if(token) secretsUsed.push(token);
    return fetch(base + '/checkout', { method: 'POST', body: JSON.stringify(body),
      headers: { Origin: origin, 'Content-Type': 'application/json', ...(token ? { Authorization: 'Bearer ' + token } : {}) } });
  };
  const deliver = (payload, sig) => fetch(base + '/webhook', { method: 'POST', body: payload,
    headers: { 'Content-Type': 'application/json', 'Stripe-Signature': sig } });

  await t.test('GET /health: test mode, from the secret key; the database answers', () => {
    assert.deepEqual(first, { ok: true, live: false, db: 'ok' });
  });

  await t.test('checkout: CORS preflight from the site', async () => {
    const r = await fetch(base + '/checkout', { method: 'OPTIONS', headers: { Origin: SITE, 'Access-Control-Request-Method': 'POST' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), SITE);
    assert.equal(r.headers.get('access-control-allow-headers'), 'Authorization, Content-Type');
  });

  await t.test('checkout: a guest token → 403; another origin → 403; an unknown sku → 400', async () => {
    const guest = await anonUser();
    let r = await post({ sku: 'col_aurora' }, { token: guest.token });
    assert.equal(r.status, 403);
    assert.deepEqual(await r.json(), { error: 'guest' });
    const u = await passwordUser();
    assert.equal((await post({ sku: 'col_aurora' }, { token: u.token, origin: 'https://evil.example' })).status, 403);
    assert.equal((await post({ sku: 'gold_bars' }, { token: u.token })).status, 400);
  });

  await t.test('checkout: a saved account gets a hosted page, asked for exactly as designed', async () => {
    const u = await passwordUser();
    secretsUsed.push(u.email);
    const r = await post({ sku: 'col_aurora' }, { token: u.token });
    assert.equal(r.status, 200);
    const j = await r.json();
    assert.match(j.url, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_e2e/);
    const call = provider.seen.find(x => x.method === 'POST' && x.path === '/v1/checkout/sessions');
    assert.equal(call.headers.authorization, 'Bearer ' + E2E.STRIPE_SECRET_KEY);
    assert.equal(call.headers['stripe-version'], STRIPE_API_VERSION);
    assert.match(call.headers['idempotency-key'], /^[0-9a-f-]{36}$/);
    assert.equal(call.form.get('mode'), 'payment');
    assert.equal(call.form.get('line_items[0][price]'), 'price_col_aurora');
    assert.equal(call.form.get('client_reference_id'), u.uid);
    assert.equal(call.form.get('metadata[uid]'), u.uid);
    assert.equal(call.form.get('managed_payments[enabled]'), 'true');
    assert.equal(call.form.get('adaptive_pricing[enabled]'), null);
    assert.equal(call.form.get('consent_collection[terms_of_service]'), 'required');
    assert.ok(![...call.form.keys()].some(k => k.startsWith('custom_text')), 'Managed Payments refuses custom_text (Gate 2)');
    assert.equal(call.form.get('success_url'), `${SITE}/?purchase=ok&sku=col_aurora&sid={CHECKOUT_SESSION_ID}`);
    assert.equal(call.form.get('customer_email'), null, 'an unverified email is not locked in');
    assert.equal(await A.db.get(`shop/rl/${u.uid}/o/col_aurora/id`), j.id);
    // The same player asking again gets the same page back.
    const again = await post({ sku: 'col_aurora' }, { token: u.token });
    assert.deepEqual(await again.json(), { url: j.url, id: j.id, reused: true });
  });

  await t.test('webhook: a correctly signed, oddly formatted payload is accepted (raw body), the grant lands, a replay is a no-op', async () => {
    const uid = `e2e_${Date.now()}`;
    const payload = JSON.stringify(E.completed(E.session({ uid, sku: 'pass_supporter', amount: 499 })), null, 3);
    const sig = signedBody(payload, E2E.STRIPE_WEBHOOK_SECRET);
    const r = await deliver(payload, sig);
    assert.equal(r.status, 200);
    assert.equal((await r.json()).state, 'paid');
    const node = await A.db.get(`shop/ent/${uid}/pass_supporter`);
    assert.equal(node.s, 'active');
    assert.equal(node.p, 499);
    assert.equal(typeof await A.db.get(`shop/badge/${uid}`), 'number', 'the supporter chip is lit');
    assert.deepEqual(await (await deliver(payload, sig)).json(), { duplicate: true });
  });

  await t.test('webhook: a body changed after signing → 400, and nothing is written', async () => {
    const uid = `e2e_tamper_${Date.now()}`;
    const payload = JSON.stringify(E.completed(E.session({ uid, sku: 'col_ultra' })));
    const r = await deliver(payload.replace('col_ultra', 'col_aurora'), signedBody(payload, E2E.STRIPE_WEBHOOK_SECRET));
    assert.equal(r.status, 400);
    assert.equal(await A.db.get(`shop/ent/${uid}`), null);
  });

  await t.test('an unknown route → 404', async () => {
    assert.equal((await fetch(base + '/nope')).status, 404);
  });

  await t.test("the Worker's log output never contains a key, the signing secret, a token or an email", () => {
    const out = w.output();
    assert.ok(out.includes('checkout: session created'), 'the log lines did reach the output');
    for(const s of [E2E.STRIPE_SECRET_KEY, E2E.STRIPE_WEBHOOK_SECRET, ...secretsUsed]) assert.ok(!out.includes(s));
  });
});
