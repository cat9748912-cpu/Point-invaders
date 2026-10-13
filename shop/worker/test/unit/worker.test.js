'use strict';
// The Worker's entry point (src/worker.mjs): what it does before it is
// configured, and the guard that keeps test settings away from a live key.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { request, read } = require('../helpers/http');

const load = () => import('../../src/worker.mjs');

const fakeAccount = () => JSON.stringify({
  type: 'service_account', client_email: 'shop@demo-pi-shop.iam.gserviceaccount.com', private_key_id: 'k',
  private_key: crypto.generateKeyPairSync('rsa', { modulusLength: 2048 }).privateKey.export({ type: 'pkcs8', format: 'pem' })
});

test('not configured: /health names what is missing; every other route is refused', async () => {
  const w = await load();
  const env = {};
  let r = await read(await w.default.fetch(request({ method: 'GET', path: '/health' }), env));
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.body, { ok: false, error: 'config', missing: ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET', 'FIREBASE_SERVICE_ACCOUNT'] });
  r = await read(await w.default.fetch(request({ path: '/checkout', body: { sku: 'col_aurora' } }), env));
  assert.equal(r.statusCode, 503);
  assert.deepEqual(r.body, { error: 'unconfigured' });
});

test('a key file that is not a service account is reported, not used', async () => {
  const w = await load();
  const b = w.build({ STRIPE_SECRET_KEY: 'rk_test_unit', STRIPE_WEBHOOK_SECRET: 'test-signing-secret-unit',
                      FIREBASE_SERVICE_ACCOUNT: '{"type":"authorized_user"}' });
  assert.equal(b.app, undefined);
  assert.match(b.problem.reason, /not a service account key file/);
});

test('emulator or fake-provider settings next to a live key: refused outright', async () => {
  const w = await load();
  for(const extra of [{ FIREBASE_DATABASE_EMULATOR_HOST: '127.0.0.1:9000' }, { FIREBASE_AUTH_EMULATOR_HOST: '127.0.0.1:9099' },
                      { STRIPE_API_BASE: 'http://127.0.0.1:1' }]){
    const b = w.build({ STRIPE_SECRET_KEY: 'rk_live_unit', STRIPE_WEBHOOK_SECRET: 'x', FIREBASE_SERVICE_ACCOUNT: fakeAccount(), ...extra });
    assert.equal(b.app, undefined);
    assert.match(b.problem.reason, /live key/);
  }
});

test('configured: the app is built once and routes requests (no network needed for an unknown route)', async () => {
  const w = await load();
  const env = { STRIPE_SECRET_KEY: 'rk_test_unit', STRIPE_WEBHOOK_SECRET: 'test-signing-secret-unit', FIREBASE_SERVICE_ACCOUNT: fakeAccount() };
  const r = await read(await w.default.fetch(request({ method: 'GET', path: '/nope' }), env));
  assert.equal(r.statusCode, 404);
  assert.deepEqual(r.body, { error: 'route' });
  assert.ok(w.build(env).app, 'a full configuration builds an app');
});
