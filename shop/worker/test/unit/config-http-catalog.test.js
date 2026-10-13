'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const C = require('../../src/config');
const { cors, routeOf, json, empty } = require('../../src/http');
const catalog = require('../../src/catalog');
const { ours } = require('../../src/webhook');
const { request } = require('../helpers/http');

test('live mode comes from the key prefix', () => {
  assert.equal(C.isLiveKey('sk_live_x'), true);
  assert.equal(C.isLiveKey('rk_live_x'), true);
  assert.equal(C.isLiveKey('sk_test_x'), false);
  assert.equal(C.isLiveKey('rk_test_x'), false);
  assert.equal(C.isLiveKey(''), false);
  assert.equal(C.isLiveKey(undefined), false);
});

test('origins: the site always; localhost only in test mode; nothing else', () => {
  assert.equal(C.originAllowed('https://pointinvaders.com', true), true);
  assert.equal(C.originAllowed('https://cat9748912-cpu.github.io', true), true);
  assert.equal(C.originAllowed('http://localhost:8080', false), true);
  assert.equal(C.originAllowed('http://127.0.0.1:5500', false), true);
  assert.equal(C.originAllowed('http://localhost:8080', true), false);
  assert.equal(C.originAllowed('http://pointinvaders.com', true), false);
  assert.equal(C.originAllowed('https://pointinvaders.com.evil.example', false), false);
  assert.equal(C.originAllowed('https://evil.example', false), false);
  assert.equal(C.originAllowed('http://localhost.evil.example', false), false);
});

test('return site: never anything the caller made up', () => {
  assert.equal(C.returnSite('http://localhost:8080', false), 'http://localhost:8080');
  assert.equal(C.returnSite('http://localhost:8080', true), 'https://pointinvaders.com');
  assert.equal(C.returnSite('https://evil.example', false), 'https://pointinvaders.com');
  assert.equal(C.returnSite(null, false, 'https://pointinvaders.com/'), 'https://pointinvaders.com');
});

test('CORS headers for an allowed origin, refusal for another, nothing needed without one', () => {
  let c = cors(request({ headers: { Origin: 'https://pointinvaders.com' } }), true);
  assert.equal(c.ok, true);
  assert.equal(c.origin, 'https://pointinvaders.com');
  assert.equal(c.headers['access-control-allow-origin'], 'https://pointinvaders.com');
  assert.equal(c.headers['access-control-allow-methods'], 'POST, OPTIONS');
  assert.equal(c.headers['access-control-allow-headers'], 'Authorization, Content-Type');
  assert.equal(c.headers['vary'], 'Origin');
  c = cors(request({ headers: { Origin: 'https://evil.example' } }), false);
  assert.equal(c.ok, false);
  assert.equal(c.headers['access-control-allow-origin'], undefined);
  c = cors(request({}), true);
  assert.equal(c.ok, true);
  assert.equal(c.origin, null);
});

test('answers: JSON, never cached; the preflight has no body', async () => {
  const r = json(418, { a: 1 }, { 'x-extra': 'y' });
  assert.equal(r.status, 418);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  assert.match(r.headers.get('content-type'), /^application\/json/);
  assert.equal(r.headers.get('x-extra'), 'y');
  assert.deepEqual(await r.json(), { a: 1 });
  const e = empty(204, { vary: 'Origin' });
  assert.equal(e.status, 204);
  assert.equal(await e.text(), '');
});

test('route: the last path segment', () => {
  assert.equal(routeOf(request({ path: '/checkout' })), 'checkout');
  assert.equal(routeOf(request({ path: '/shop/checkout' })), 'checkout');
  assert.equal(routeOf(request({ path: '/webhook/' })), 'webhook');
  assert.equal(routeOf(request({ path: '/health?x=1', method: 'GET' })), 'health');
  assert.equal(routeOf(request({ path: '/' })), '');
});

test('catalogue: valid, nine SKUs, labels, and its validator catches mistakes', () => {
  assert.equal(catalog.validate(), true);
  assert.equal(catalog.SKUS.length, 9);
  assert.equal(catalog.priceLabel(catalog.find('pass_supporter')), '$4.99');
  assert.equal(catalog.find('nope'), null);
  assert.equal(catalog.find('__proto__'), null);
  assert.equal(catalog.find('constructor'), null);
  const bad = (patch) => () => catalog.validate([{ ...catalog.SKUS[0] }, { ...catalog.SKUS[1], ...patch }]);
  assert.throws(bad({ sku: 'Bad-Id' }), /bad sku id/);
  assert.throws(bad({ amount: 1.5 }), /bad amount/);
  assert.throws(bad({ grants: ['col-x-patron'] }), /granted by two skus/);
  assert.throws(bad({ grants: ['col-pink'] }), /bad grant id/);
  assert.throws(bad({ kind: 'exhibition', cat: 'powerups' }), /exhibition sku grants no item/);
  assert.throws(() => catalog.validate([catalog.SKUS[1]]), /supporter pass is missing/);
  for(const s of catalog.SKUS) for(const g of s.grants) assert.ok(g.length <= 40, 'fits equipped/$cat (≤ 40 chars)');
});

test('a session is ours only with our metadata version, a matching uid and a known SKU', () => {
  const s = { id: 'cs_1', mode: 'payment', client_reference_id: 'u1', metadata: { uid: 'u1', sku: 'col_aurora', v: '1' } };
  assert.deepEqual(ours(s), { uid: 'u1', sku: 'col_aurora', sid: 'cs_1' });
  assert.equal(ours({ ...s, metadata: { ...s.metadata, v: undefined } }), null);
  assert.equal(ours({ ...s, client_reference_id: 'u2' }), null);
  assert.equal(ours({ ...s, metadata: { ...s.metadata, sku: 'gold_bars' } }), null);
  assert.equal(ours({ ...s, mode: 'subscription' }), null);
  assert.equal(ours(null), null);
});
