'use strict';
// POST /checkout against the Auth and Database emulators: real ID tokens (guest,
// saved, verified, upgraded-from-guest), a real database, a fake provider client.
// The Auth emulator's tokens are unsigned, so the verifier runs in its emulator
// mode here; its signature checks against Google's keys are unit-tested
// (test/unit/idtoken.test.js).
const test = require('node:test');
const assert = require('node:assert/strict');
const { SKIP, PROJECT, dbFor, anonUser, passwordUser, signIn, linkEmail, verifyEmail, claims, quietLog } = require('../helpers/emu');
const { fakeStripe } = require('../helpers/fake-stripe');
const { request, read } = require('../helpers/http');
const { createApp } = require('../../src/app');
const { makeVerifier } = require('../../src/idtoken');
const catalog = require('../../src/catalog');

const SITE = 'https://pointinvaders.com';
let A;

function priced(){
  return Object.fromEntries(catalog.SKUS.map(s => [s.lookupKey, { id: 'price_' + s.sku, object: 'price', lookup_key: s.lookupKey,
                                                                  unit_amount: s.amount, currency: 'usd', active: true }]));
}

function rig({ live = false, managed = true, now = Date.now, projectId = PROJECT } = {}){
  const stripe = fakeStripe({ prices: priced() });
  const log = quietLog();
  const handler = createApp({ db: A.db, verifier: makeVerifier({ projectId, now, emulator: true }), stripe, log, now,
                              cfg: { live, webhookSecret: 'test-signing-secret-unused', managed, autoRefundDupes: true, site: SITE } });
  async function call({ method = 'POST', origin = SITE, token, body = { sku: 'col_aurora' }, path = '/checkout' } = {}){
    const headers = {};
    if(origin) headers.Origin = origin;
    if(token) headers.Authorization = 'Bearer ' + token;
    return read(await handler(request({ method, path, headers, body })));
  }
  return { stripe, log, call };
}

test('checkout', { skip: SKIP, concurrency: false }, async t => {
  A = dbFor('demo-pi-checkout-default-rtdb');
  t.beforeEach(async () => { await A.clear(); });

  await t.test('CORS preflight: the site → 204 with headers; another origin → 403', async () => {
    const { call } = rig();
    let r = await call({ method: 'OPTIONS' });
    assert.equal(r.statusCode, 204);
    assert.equal(r.headers['access-control-allow-origin'], SITE);
    assert.equal(r.headers['access-control-allow-methods'], 'POST, OPTIONS');
    r = await call({ method: 'OPTIONS', origin: 'https://evil.example' });
    assert.equal(r.statusCode, 403);
    assert.deepEqual(r.body, { error: 'origin' });
  });

  await t.test('localhost: allowed in test mode, refused in live mode', async () => {
    assert.equal((await rig().call({ method: 'OPTIONS', origin: 'http://localhost:8080' })).statusCode, 204);
    assert.equal((await rig({ live: true }).call({ method: 'OPTIONS', origin: 'http://localhost:8080' })).statusCode, 403);
  });

  await t.test('GET → 405', async () => {
    assert.equal((await rig().call({ method: 'GET' })).statusCode, 405);
  });

  await t.test('no token → 401; a forged token → 401', async () => {
    const { call, stripe } = rig();
    assert.equal((await call({})).statusCode, 401);
    assert.equal((await call({ token: 'not.a.token' })).statusCode, 401);
    assert.equal(stripe.calls.length, 0, 'the provider is never called for an unauthenticated request');
  });

  await t.test('anonymous (guest) token → 403 guest', async () => {
    const guest = await anonUser();
    assert.equal(claims(guest.token).firebase.sign_in_provider, 'anonymous');
    const { call, stripe } = rig();
    const r = await call({ token: guest.token });
    assert.equal(r.statusCode, 403);
    assert.deepEqual(r.body, { error: 'guest' });
    assert.equal(stripe.calls.length, 0);
  });

  await t.test('a guest who saves their account (linkWithCredential, same uid) can buy', async () => {
    const guest = await anonUser();
    const saved = await linkEmail(guest.token);
    assert.equal(saved.uid, guest.uid, 'linking keeps the uid');
    assert.equal(claims(saved.token).firebase.sign_in_provider, 'password', 'the token returned by the link is no longer anonymous');
    const r = await rig().call({ token: saved.token });
    assert.equal(r.statusCode, 200);
  });

  await t.test('a token for another project, or an expired one → 401', async () => {
    const u = await passwordUser();
    assert.equal((await rig({ projectId: 'some-other-project' }).call({ token: u.token })).statusCode, 401);
    const late = () => Date.now() + 2 * 3600 * 1000;               // the emulator's tokens last an hour
    assert.equal((await rig({ now: late }).call({ token: u.token })).statusCode, 401);
    assert.equal((await rig().call({ token: u.token })).statusCode, 200);
  });

  await t.test('unknown or missing sku → 400', async () => {
    const u = await passwordUser();
    const { call, stripe } = rig();
    assert.deepEqual((await call({ token: u.token, body: { sku: 'gold_bars' } })).body, { error: 'bad_sku' });
    assert.equal((await call({ token: u.token, body: {} })).statusCode, 400);
    assert.equal((await call({ token: u.token, body: { sku: '__proto__' } })).statusCode, 400);
    assert.equal(stripe.calls.length, 0);
  });

  await t.test('already owned → 409', async () => {
    const u = await passwordUser();
    await A.db.set(`shop/ent/${u.uid}/col_aurora`, { s: 'active', ord: { cs_old: 'paid' } });
    const { call, stripe } = rig();
    const r = await call({ token: u.token });
    assert.equal(r.statusCode, 409);
    assert.deepEqual(r.body, { error: 'owned' });
    assert.equal(stripe.calls.length, 0);
  });

  await t.test('a revoked entitlement can be bought again', async () => {
    const u = await passwordUser();
    await A.db.set(`shop/ent/${u.uid}/col_aurora`, { s: 'revoked', ord: { cs_old: 'refunded' } });
    assert.equal((await rig().call({ token: u.token })).statusCode, 200);
  });

  await t.test('success: the exact session parameters, and the open session remembered', async () => {
    const u = await passwordUser();
    const t0 = Date.now();
    const { call, stripe } = rig();
    const r = await call({ token: u.token, body: { sku: 'pass_supporter' } });
    assert.equal(r.statusCode, 200);
    assert.match(r.body.url, /^https:\/\/checkout\.stripe\.com\/c\/pay\/cs_test_/);
    assert.equal(r.headers['cache-control'], 'no-store');

    const [list] = stripe.callsOf('prices.list');
    assert.deepEqual(list.args[0], { lookup_keys: ['pass_supporter'], active: true, limit: 1 });
    const [create] = stripe.callsOf('checkout.sessions.create');
    const p = create.args[0];
    assert.equal(p.mode, 'payment');
    assert.deepEqual(p.line_items, [{ price: 'price_pass_supporter', quantity: 1 }]);
    assert.equal(p.client_reference_id, u.uid);
    assert.deepEqual(p.metadata, { uid: u.uid, sku: 'pass_supporter', v: '1' });
    assert.deepEqual(p.payment_intent_data.metadata, { uid: u.uid, sku: 'pass_supporter', v: '1' });
    assert.deepEqual(p.managed_payments, { enabled: true });
    assert.ok(!('adaptive_pricing' in p) && !('automatic_tax' in p));
    assert.ok(!('customer_email' in p), 'an unverified email is not locked into the checkout page');
    assert.equal(p.success_url, `${SITE}/?purchase=ok&sku=pass_supporter&sid={CHECKOUT_SESSION_ID}`);
    assert.ok(p.expires_at >= Math.floor(t0 / 1000) + 30 * 60 && p.expires_at <= Math.floor(Date.now() / 1000) + 36 * 60);

    const open = (await A.db.get(`shop/rl/${u.uid}/o/pass_supporter`));
    assert.equal(open.id, r.body.id);
    assert.equal(open.exp, p.expires_at);
    assert.equal(typeof (await A.db.get(`shop/rl/${u.uid}/at`)), 'number');
  });

  await t.test('a verified email is pre-filled', async () => {
    const u = await passwordUser();
    await verifyEmail(u.uid);
    const fresh = await signIn(u.email);
    assert.equal(claims(fresh.token).email_verified, true);
    const { call, stripe } = rig();
    assert.equal((await call({ token: fresh.token })).statusCode, 200);
    assert.equal(stripe.callsOf('checkout.sessions.create')[0].args[0].customer_email, u.email);
  });

  await t.test('without Managed Payments: Adaptive Pricing, no managed flag', async () => {
    const u = await passwordUser();
    const { call, stripe } = rig({ managed: false });
    assert.equal((await call({ token: u.token })).statusCode, 200);
    const p = stripe.callsOf('checkout.sessions.create')[0].args[0];
    assert.deepEqual(p.adaptive_pricing, { enabled: true });
    assert.ok(!('managed_payments' in p));
  });

  await t.test('test mode from localhost returns to localhost', async () => {
    const u = await passwordUser();
    const { call, stripe } = rig();
    assert.equal((await call({ token: u.token, origin: 'http://localhost:8080' })).statusCode, 200);
    assert.ok(stripe.callsOf('checkout.sessions.create')[0].args[0].success_url.startsWith('http://localhost:8080/?purchase=ok'));
  });

  await t.test('a second request hands back the open session: same URL, no new session, no rate limit', async () => {
    const u = await passwordUser();
    const { call, stripe } = rig();
    const a = await call({ token: u.token });
    const b = await call({ token: u.token });
    assert.equal(b.statusCode, 200);
    assert.equal(b.body.url, a.body.url);
    assert.equal(b.body.reused, true);
    assert.equal(stripe.callsOf('checkout.sessions.create').length, 1);
  });

  await t.test('the open session was paid and the webhook is in flight → 409 owned_pending', async () => {
    const u = await passwordUser();
    const { call, stripe } = rig();
    const a = await call({ token: u.token });
    Object.assign(stripe.sessions.get(a.body.id), { status: 'complete', payment_status: 'paid' });
    const b = await call({ token: u.token });
    assert.equal(b.statusCode, 409);
    assert.deepEqual(b.body, { error: 'owned_pending' });
  });

  await t.test('a new session inside 10 s → 429 with Retry-After; allowed again after', async () => {
    const u = await passwordUser();
    let clock = Date.now();
    const { call, stripe } = rig({ now: () => clock });
    const a = await call({ token: u.token });
    stripe.sessions.get(a.body.id).status = 'expired';           // nothing to hand back
    const b = await call({ token: u.token });
    assert.equal(b.statusCode, 429);
    assert.equal(b.body.error, 'slow');
    assert.ok(b.body.retryAfter >= 1 && b.body.retryAfter <= 10);
    assert.equal(b.headers['retry-after'], String(b.body.retryAfter));
    clock += 10_001;
    const c = await call({ token: u.token });
    assert.equal(c.statusCode, 200);
    assert.notEqual(c.body.id, a.body.id);
  });

  await t.test('the rate limit is per player', async () => {
    const u1 = await passwordUser(), u2 = await passwordUser();
    const { call } = rig();
    assert.equal((await call({ token: u1.token })).statusCode, 200);
    assert.equal((await call({ token: u2.token })).statusCode, 200);
  });

  await t.test('kill switch shop/cfg/open = false → 503; anything else is open', async () => {
    const u = await passwordUser();
    await A.db.set('shop/cfg/open', false);
    assert.deepEqual((await rig().call({ token: u.token })).body, { error: 'closed' });
    await A.db.set('shop/cfg/open', true);
    assert.equal((await rig().call({ token: u.token })).statusCode, 200);
  });

  await t.test('no price for the lookup key (not seeded) → 503 unpriced', async () => {
    const u = await passwordUser();
    const { call, stripe, log } = rig();
    stripe.setPrice('col_aurora', null);
    assert.deepEqual((await call({ token: u.token })).body, { error: 'unpriced' });
    assert.ok(log.lines.some(l => l.level === 'error' && /no active price/.test(l.msg)));
  });

  await t.test('the provider refuses → 502, nothing is remembered as open, and the log says why (no address in it)', async () => {
    const u = await passwordUser();
    const { call, stripe, log } = rig();
    stripe.failNext('checkout.sessions.create', Object.assign(
      new Error('You cannot use custom_text with Managed Payments. Contact buyer@example.com for help.'),
      { type: 'invalid_request_error' }));
    assert.deepEqual((await call({ token: u.token })).body, { error: 'provider' });
    assert.equal((await A.db.get(`shop/rl/${u.uid}/o`)), null);
    const line = log.lines.find(l => l.msg === 'checkout: session refused by provider');
    assert.equal(line.data.type, 'invalid_request_error');
    assert.equal(line.data.message, 'You cannot use custom_text with Managed Payments. Contact [email] for help.');
    // …and a failed price lookup is a 502 too (a later clock, past the rate limit).
    const r2 = rig({ now: () => Date.now() + 20_000 });
    r2.stripe.failNext('prices.list');
    assert.deepEqual((await r2.call({ token: u.token })).body, { error: 'provider' });
  });

  await t.test('unknown route → 404; health → 200', async () => {
    const { call } = rig();
    assert.equal((await call({ path: '/nope' })).statusCode, 404);
    const h = await call({ method: 'GET', path: '/health' });
    assert.deepEqual(h.body, { ok: true, live: false, db: 'ok' });
  });
});
