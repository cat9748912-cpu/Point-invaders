'use strict';
// The provider client (src/stripe.js): what goes over the wire, how errors and
// retries behave, and the webhook signature, checked against the provider's own
// Node library in both directions.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeStripe, verifySignature, formEncode, TOLERANCE_S } = require('../../src/stripe');
const { STRIPE_API_VERSION } = require('../../src/config');
const { buildSessionParams } = require('../../src/session');
const catalog = require('../../src/catalog');

const sign = (payload, secret, t) =>
  `t=${t},v1=${crypto.createHmac('sha256', secret).update(`${t}.${payload}`).digest('hex')}`;
const bytes = s => new TextEncoder().encode(s);

/** A fetch that answers from a script: { status, body, headers } or an Error to throw. */
function scripted(answers){
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, ...init });
    const a = answers.shift();
    if(a instanceof Error) throw a;
    return new Response(JSON.stringify(a.body), { status: a.status || 200, headers: a.headers || {} });
  };
  return { f, seen };
}

test('form encoding: nested objects and arrays as bracketed keys', () => {
  const q = new URLSearchParams(formEncode({ a: 1, b: { c: 'x y', d: true }, l: ['k1', 'k2'],
                                             li: [{ price: 'p', quantity: 1 }], u: undefined, n: null }));
  assert.deepEqual([...q.entries()], [['a', '1'], ['b[c]', 'x y'], ['b[d]', 'true'], ['l[0]', 'k1'], ['l[1]', 'k2'],
                                      ['li[0][price]', 'p'], ['li[0][quantity]', '1']]);
});

test('a whole checkout session survives the encoding: the provider decodes exactly what session.js built', () => {
  const params = buildSessionParams({ item: catalog.find('col_aurora'), price: { id: 'price_1' }, uid: 'u1', email: null,
                                      emailVerified: false, site: 'https://pointinvaders.com', managed: true, now: 1_800_000_000_000 });
  const back = Object.fromEntries(new URLSearchParams(formEncode(params)));
  assert.equal(back.success_url, 'https://pointinvaders.com/?purchase=ok&sku=col_aurora&sid={CHECKOUT_SESSION_ID}');
  assert.equal(back['line_items[0][price]'], 'price_1');
  assert.equal(back['line_items[0][quantity]'], '1');
  assert.equal(back['metadata[uid]'], 'u1');
  assert.equal(back['payment_intent_data[metadata][sku]'], 'col_aurora');
  assert.equal(back['consent_collection[terms_of_service]'], 'required');
  assert.equal(back['managed_payments[enabled]'], 'true');
  assert.equal(back['custom_text[submit][message]'], params.custom_text.submit.message);
  assert.equal(back.expires_at, String(params.expires_at));
});

test('requests: the key, the pinned API version, a query for GET, a form body and an idempotency key for POST', async () => {
  const { f, seen } = scripted([{ body: { object: 'list', data: [] } }, { body: { id: 'cs_1', url: 'u' } }]);
  const s = makeStripe({ key: 'sk_test_unit', fetch: f });
  await s.prices.list({ lookup_keys: ['col_aurora'], active: true, limit: 1 });
  assert.equal(seen[0].method, 'GET');
  assert.equal(seen[0].url, 'https://api.stripe.com/v1/prices?lookup_keys%5B0%5D=col_aurora&active=true&limit=1');
  assert.equal(seen[0].headers.authorization, 'Bearer sk_test_unit');
  assert.equal(seen[0].headers['stripe-version'], STRIPE_API_VERSION);
  assert.equal(seen[0].body, undefined);
  assert.deepEqual(await s.checkout.sessions.create({ mode: 'payment' }), { id: 'cs_1', url: 'u' });
  assert.equal(seen[1].method, 'POST');
  assert.equal(seen[1].url, 'https://api.stripe.com/v1/checkout/sessions');
  assert.equal(seen[1].headers['content-type'], 'application/x-www-form-urlencoded');
  assert.equal(seen[1].body, 'mode=payment');
  assert.match(seen[1].headers['idempotency-key'], /^[0-9a-f-]{36}$/);
});

test('every call the shop makes goes to the right address', async () => {
  const { f, seen } = scripted(Array.from({ length: 6 }, () => ({ body: {} })));
  const s = makeStripe({ key: 'sk_test_unit', fetch: f, base: 'http://127.0.0.1:1234/' });
  await s.checkout.sessions.retrieve('cs_1');
  await s.checkout.sessions.list({ payment_intent: 'pi_1', limit: 1 });
  await s.paymentIntents.retrieve('pi_1');
  await s.charges.retrieve('ch_1');
  await s.refunds.create({ payment_intent: 'pi_1' }, { idempotencyKey: 'dup-refund:pi_1' });
  await s.prices.list({ lookup_keys: ['a'] });
  assert.deepEqual(seen.map(x => `${x.method} ${x.url}`), [
    'GET http://127.0.0.1:1234/v1/checkout/sessions/cs_1',
    'GET http://127.0.0.1:1234/v1/checkout/sessions?payment_intent=pi_1&limit=1',
    'GET http://127.0.0.1:1234/v1/payment_intents/pi_1',
    'GET http://127.0.0.1:1234/v1/charges/ch_1',
    'POST http://127.0.0.1:1234/v1/refunds',
    'GET http://127.0.0.1:1234/v1/prices?lookup_keys%5B0%5D=a'
  ]);
  assert.equal(seen[4].headers['idempotency-key'], 'dup-refund:pi_1');
});

test("errors carry the provider's status, code, type and param; a 400 is not retried", async () => {
  const { f, seen } = scripted([{ status: 400, body: { error: { type: 'invalid_request_error', code: 'parameter_unknown',
                                                                 param: 'adaptive_pricing', message: 'Received unknown parameter' } } }]);
  const s = makeStripe({ key: 'sk_test_unit', fetch: f });
  await assert.rejects(s.checkout.sessions.create({ adaptive_pricing: { enabled: true } }),
    e => e.statusCode === 400 && e.code === 'parameter_unknown' && e.param === 'adaptive_pricing' && e.type === 'invalid_request_error');
  assert.equal(seen.length, 1);
});

test('a network error or a 5xx is retried once, with the same idempotency key', async () => {
  const a = scripted([new TypeError('fetch failed'), { body: { id: 're_1' } }]);
  const s = makeStripe({ key: 'sk_test_unit', fetch: a.f });
  assert.deepEqual(await s.refunds.create({ payment_intent: 'pi_1' }, { idempotencyKey: 'dup-refund:pi_1' }), { id: 're_1' });
  assert.equal(a.seen.length, 2);
  assert.deepEqual(a.seen.map(x => x.headers['idempotency-key']), ['dup-refund:pi_1', 'dup-refund:pi_1']);

  const b = scripted([{ status: 503, body: {} }, { status: 503, body: {} }]);
  await assert.rejects(makeStripe({ key: 'sk_test_unit', fetch: b.f }).charges.retrieve('ch_1'), e => e.statusCode === 503);
  assert.equal(b.seen.length, 2, 'one retry, then the error');

  const c = scripted([{ status: 500, body: {}, headers: { 'stripe-should-retry': 'false' } }]);
  await assert.rejects(makeStripe({ key: 'sk_test_unit', fetch: c.f }).charges.retrieve('ch_1'));
  assert.equal(c.seen.length, 1, 'the provider said not to retry');
});

test('webhook signature: the exact bytes, the right secret, a recent timestamp', async () => {
  const payload = JSON.stringify({ id: 'evt_1', type: 't' }, null, 2);
  const raw = bytes(payload);
  const secret = 'test-signing-secret-unit';
  const t = 1_800_000_000;
  const now = () => t * 1000 + 30_000;
  assert.deepEqual(await verifySignature(raw, sign(payload, secret, t), secret, { now }), { id: 'evt_1', type: 't' });
  // A secret being rolled: several v1 signatures, any one matching is enough.
  const rolled = `t=${t},v1=${'0'.repeat(64)},${sign(payload, secret, t).split(',')[1]}`;
  assert.equal((await verifySignature(raw, rolled, secret, { now })).id, 'evt_1');

  await assert.rejects(verifySignature(raw, sign(payload, 'test-signing-secret-other', t), secret, { now }), /no signature matches/);
  await assert.rejects(verifySignature(bytes(payload.replace('evt_1', 'evt_2')), sign(payload, secret, t), secret, { now }), /no signature matches/);
  await assert.rejects(verifySignature(raw, sign(payload, secret, t - TOLERANCE_S - 31), secret, { now }), /too old/);
  await assert.rejects(verifySignature(raw, `t=${t}`, secret, { now }), /malformed/);
  await assert.rejects(verifySignature(raw, '', secret, { now }), /malformed/);
  await assert.rejects(verifySignature(raw, sign(payload, secret, t).replace('v1=', 'v0='), secret, { now }), /malformed/,
    'only the v1 scheme counts');
  await assert.rejects(verifySignature(raw, sign(payload, secret, t), '', { now }), /no signing secret/);
});

test("the provider library's signatures pass this check, and this check's scheme passes the library's", async () => {
  const Stripe = require('stripe');
  const lib = new Stripe('sk_test_unit');
  const payload = JSON.stringify({ id: 'evt_lib', object: 'event' });
  const secret = 'test-signing-secret-lib';
  const header = lib.webhooks.generateTestHeaderString({ payload, secret });
  assert.equal((await verifySignature(bytes(payload), header, secret)).id, 'evt_lib');
  assert.equal(lib.webhooks.constructEvent(payload, sign(payload, secret, Math.floor(Date.now() / 1000)), secret).id, 'evt_lib');
});
