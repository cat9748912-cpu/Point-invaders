'use strict';
// The deployable function (functions/index.js) inside the Functions emulator, with
// the Auth and Database emulators beside it. What this proves that the handler
// tests cannot: the real framework hands the webhook its RAW body, routes both
// URL forms, loads the two secrets and the parameters, and the Admin SDK writes
// land in the database the function was configured with.
const test = require('node:test');
const assert = require('node:assert/strict');
const { E2E } = require('./secrets');
const { signedBody } = require('../helpers/fake-stripe');
const E = require('../helpers/events');
const { adminApp, anonUser, passwordUser } = require('../helpers/emu');

const FN_HOST = process.env.FIREBASE_FUNCTIONS_EMULATOR_HOST || '127.0.0.1:5001';
const PROJECT = process.env.GCLOUD_PROJECT || 'demo-pi-shop';
const BASE = `http://${FN_HOST}/${PROJECT}/asia-southeast1/shop`;
const HAVE = !!(process.env.FIREBASE_DATABASE_EMULATOR_HOST && process.env.FIREBASE_AUTH_EMULATOR_HOST);

async function post(route, { headers = {}, body } = {}){
  const r = await fetch(`${BASE}/${route}`, { method: 'POST', headers, body });
  const text = await r.text();
  let json = null; try{ json = JSON.parse(text); }catch(e){}
  return { status: r.status, headers: r.headers, json, text };
}

test('the deployed function, end to end', { skip: HAVE ? false : 'needs npm run test:e2e' }, async t => {
  // index.js names the project's own database; in the emulator that is a local namespace.
  const A = adminApp('neal-with-roblox-default-rtdb');
  t.after(async () => { await A.app.delete(); });

  await t.test('GET /health → test mode, from the secret key\'s prefix', async () => {
    const r = await fetch(`${BASE}/health`);
    assert.equal(r.status, 200);
    assert.deepEqual(await r.json(), { ok: true, live: false });
  });

  await t.test('webhook: a correctly signed, oddly formatted payload is accepted (raw body) and the grant lands', async () => {
    const uid = 'e2e_' + Date.now();
    const s = E.session({ uid, sku: 'pass_supporter', amount: 499 });
    const evt = E.completed(s);
    const raw = JSON.stringify(evt, null, 4) + '\n';
    const r = await post('webhook', { headers: { 'content-type': 'application/json', 'stripe-signature': signedBody(raw, E2E.STRIPE_WEBHOOK_SECRET) }, body: raw });
    assert.equal(r.status, 200, r.text);
    assert.equal(r.json.ok, true);
    const ent = (await A.db.ref(`shop/ent/${uid}/pass_supporter`).once('value')).val();
    assert.equal(ent.s, 'active');
    assert.equal(typeof (await A.db.ref(`shop/badge/${uid}`).once('value')).val(), 'number');

    const again = await post('webhook', { headers: { 'content-type': 'application/json', 'stripe-signature': signedBody(raw, E2E.STRIPE_WEBHOOK_SECRET) }, body: raw });
    assert.deepEqual(again.json, { duplicate: true });
  });

  await t.test('webhook: a body changed after signing → 400', async () => {
    const evt = E.completed(E.session({ uid: 'e2e_x', sku: 'col_aurora' }));
    const raw = JSON.stringify(evt);
    const sig = signedBody(raw, E2E.STRIPE_WEBHOOK_SECRET);
    const r = await post('webhook', { headers: { 'content-type': 'application/json', 'stripe-signature': sig }, body: raw.replace('col_aurora', 'col_ultra') });
    assert.equal(r.status, 400);
  });

  await t.test('checkout: CORS preflight from the site', async () => {
    const r = await fetch(`${BASE}/checkout`, { method: 'OPTIONS', headers: { Origin: 'https://pointinvaders.com',
      'Access-Control-Request-Method': 'POST', 'Access-Control-Request-Headers': 'authorization,content-type' } });
    assert.equal(r.status, 204);
    assert.equal(r.headers.get('access-control-allow-origin'), 'https://pointinvaders.com');
  });

  await t.test('checkout: a guest token → 403; another origin → 403; an unknown sku → 400', async () => {
    const guest = await anonUser();
    let r = await post('checkout', { headers: { Origin: 'https://pointinvaders.com', 'content-type': 'application/json', Authorization: 'Bearer ' + guest.token },
                                     body: JSON.stringify({ sku: 'col_aurora' }) });
    assert.equal(r.status, 403);
    assert.deepEqual(r.json, { error: 'guest' });
    r = await post('checkout', { headers: { Origin: 'https://evil.example', 'content-type': 'application/json' }, body: '{}' });
    assert.equal(r.status, 403);
    const saved = await passwordUser();
    r = await post('checkout', { headers: { Origin: 'https://pointinvaders.com', 'content-type': 'application/json', Authorization: 'Bearer ' + saved.token },
                                 body: JSON.stringify({ sku: 'gold_bars' }) });
    assert.equal(r.status, 400);
    assert.deepEqual(r.json, { error: 'bad_sku' });
  });

  await t.test('an unknown route → 404', async () => {
    assert.equal((await post('nope')).status, 404);
  });
});
