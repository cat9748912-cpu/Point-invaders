'use strict';
// scripts/seed-products.js and scripts/catalog-parity.js, with a fake product API
// and fixture catalogues. No network.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const seed = require('../../../scripts/seed-products');
const parity = require('../../../scripts/catalog-parity');
const catalog = require('../../src/catalog');

function fakeAccount(){
  const products = [], prices = [], calls = [];
  let n = 0;
  return {
    products, prices, calls,
    get api(){
      return {
        products: {
          list(params){ calls.push(['products.list', params]); const snap = [...products];
                        return { async *[Symbol.asyncIterator](){ for(const p of snap) yield p; } }; },
          async create(p){ calls.push(['products.create', p]); const prod = { id: `prod_${++n}`, object: 'product', ...p }; products.push(prod); return prod; },
          async update(id, p){ calls.push(['products.update', id, p]); const prod = products.find(x => x.id === id); Object.assign(prod, p); return prod; }
        },
        prices: {
          async list(q){ calls.push(['prices.list', q]); return { data: prices.filter(p => p.lookup_key === q.lookup_keys[0]).slice(0, q.limit || 10) }; },
          async create(p){
            calls.push(['prices.create', p]);
            if(p.transfer_lookup_key){
              for(const x of prices){ if(x.lookup_key === p.lookup_key) x.lookup_key = null; }
            }else if(prices.some(x => x.lookup_key === p.lookup_key)){
              throw new Error('lookup key already in use');   // what the provider does without the transfer flag
            }
            const { transfer_lookup_key, ...rest } = p;
            const pr = { id: `price_${++n}`, object: 'price', active: true, ...rest };
            prices.push(pr);
            return pr;
          },
          async update(id, p){ calls.push(['prices.update', id, p]); Object.assign(prices.find(x => x.id === id), p); return {}; }
        }
      };
    }
  };
}

test('seed: an empty account gets one product and one tax-inclusive USD price per SKU', async () => {
  const acct = fakeAccount();
  const steps = await seed.plan(acct.api);
  assert.equal(steps.length, catalog.SKUS.length);
  assert.ok(steps.every(s => s.productAction === 'create' && s.priceAction === 'create'));
  await seed.apply(acct.api, steps);
  assert.equal(acct.products.length, catalog.SKUS.length);
  for(const s of catalog.SKUS){
    const prod = acct.products.find(p => p.metadata.pi_sku === s.sku);
    assert.equal(prod.name, s.name);
    assert.equal(prod.tax_code, 'txcd_10201000');
    assert.equal(prod.metadata.pi_kind, s.kind);
    const pr = acct.prices.find(p => p.lookup_key === s.sku);
    assert.equal(pr.product, prod.id);
    assert.equal(pr.unit_amount, s.amount);
    assert.equal(pr.currency, 'usd');
    assert.equal(pr.tax_behavior, 'inclusive');
  }
});

test('seed: running it again changes nothing', async () => {
  const acct = fakeAccount();
  await seed.apply(acct.api, await seed.plan(acct.api));
  const writes = acct.calls.filter(c => /create|update/.test(c[0])).length;
  const again = await seed.plan(acct.api);
  assert.ok(again.every(s => s.productAction === 'ok' && s.priceAction === 'ok'), JSON.stringify(again.map(s => [s.sku, s.productAction, s.priceAction])));
  await seed.apply(acct.api, again);
  assert.equal(acct.calls.filter(c => /create|update/.test(c[0])).length, writes);
});

test('seed: a changed amount makes a new price that takes the lookup key; the old one is archived', async () => {
  const acct = fakeAccount();
  await seed.apply(acct.api, await seed.plan(acct.api));
  const old = acct.prices.find(p => p.lookup_key === 'col_aurora');
  const changed = catalog.SKUS.map(s => s.sku === 'col_aurora' ? { ...s, amount: 249 } : s);
  const steps = await seed.plan(acct.api, changed);
  assert.equal(steps.find(s => s.sku === 'col_aurora').priceAction, 'replace');
  assert.ok(steps.filter(s => s.sku !== 'col_aurora').every(s => s.priceAction === 'ok'));
  await seed.apply(acct.api, steps);
  const now = acct.prices.find(p => p.lookup_key === 'col_aurora');
  assert.notEqual(now.id, old.id);
  assert.equal(now.unit_amount, 249);
  assert.equal(old.active, false);
  assert.equal(old.lookup_key, null);
  const create = acct.calls.filter(c => c[0] === 'prices.create').pop();
  assert.equal(create[1].transfer_lookup_key, true);
});

test('seed: a renamed product is updated in place', async () => {
  const acct = fakeAccount();
  await seed.apply(acct.api, await seed.plan(acct.api));
  const renamed = catalog.SKUS.map(s => s.sku === 'wld_polar' ? { ...s, name: 'Polar Night II' } : s);
  const steps = await seed.plan(acct.api, renamed);
  assert.equal(steps.find(s => s.sku === 'wld_polar').productAction, 'update');
  await seed.apply(acct.api, steps);
  assert.equal(acct.products.find(p => p.metadata.pi_sku === 'wld_polar').name, 'Polar Night II');
});

test('seed: the key decides the mode, and a live key needs --live', async () => {
  assert.equal(seed.modeOf('sk_test_abc'), 'test');
  assert.equal(seed.modeOf('rk_live_abc'), 'live');
  assert.equal(seed.modeOf('pk_test_abc'), null, 'a publishable key is not a secret key');
  const quiet = { log(){}, error(){} };
  assert.equal(await seed.main(['--apply'], { STRIPE_SECRET_KEY: '' }, quiet), 2);
  assert.equal(await seed.main(['--apply'], { STRIPE_SECRET_KEY: 'sk_live_abc' }, quiet), 2);
  assert.equal(await seed.main(['--apply', '--live'], { STRIPE_SECRET_KEY: 'sk_test_abc' }, quiet), 2);
});

// ── parity ────────────────────────────────────────────────────────────────
const clientOf = list => list.map(s => ({ sku: s.sku, name: s.name, kind: s.kind, cat: s.cat, price: catalog.priceLabel(s), grants: [...s.grants] }));
const fixture = skus => `// app.js, abridged\nvar unrelated = 1;\n${parity.BEGIN}\nconst SHOP_SKUS = ${JSON.stringify(skus, null, 2)};\n${parity.END}\nfunction more(){}\n`;

test('parity: no markers → null; a matching client catalogue → no problems', () => {
  assert.equal(parity.readClient('const SHOP_SKUS = [];'), null);
  const client = parity.readClient(fixture(clientOf(catalog.SKUS)));
  assert.equal(client.length, catalog.SKUS.length);
  assert.deepEqual(parity.compare(catalog.SKUS, client), []);
});

test('parity: every kind of drift is reported', () => {
  const c = clientOf(catalog.SKUS);
  c.find(x => x.sku === 'col_aurora').price = '$0.99';
  c.find(x => x.sku === 'cur_comet').grants = ['cur-x-other'];
  c.find(x => x.sku === 'skin_kitsune').kind = 'pass';
  c.find(x => x.sku === 'wld_polar').name = 'Polar Day';
  c.splice(c.findIndex(x => x.sku === 'pu_anchor'), 1);
  c.push({ sku: 'free_gold', name: 'Gold', kind: 'cosmetic', cat: 'colors', price: '$0.00', grants: [] });
  const p = parity.compare(catalog.SKUS, c).join('\n');
  for(const want of [/col_aurora: price \$1\.99 vs \$0\.99/, /cur_comet: unlocks/, /skin_kitsune: kind cosmetic vs pass/,
                     /wld_polar: name/, /pu_anchor: on the server, missing from the client/, /free_gold: on the client, unknown to the server/]){
    assert.match(p, want);
  }
});

test('parity: the CLI exits 0 / 1 / 2, and the block runs in an empty sandbox', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'parity-'));
  const quiet = { log(){}, error(){} };
  const ok = path.join(dir, 'ok.js'), bad = path.join(dir, 'bad.js'), none = path.join(dir, 'none.js');
  fs.writeFileSync(ok, fixture(clientOf(catalog.SKUS)));
  const drift = clientOf(catalog.SKUS); drift[0].price = '$9.99';
  fs.writeFileSync(bad, fixture(drift));
  fs.writeFileSync(none, 'var x = 1;');
  assert.equal(parity.main(['--app', ok], quiet), 0);
  assert.equal(parity.main(['--app', bad], quiet), 1);
  assert.equal(parity.main(['--app', none], quiet), 2);
  assert.equal(parity.main(['--app', none, '--allow-missing'], quiet), 0);
  assert.throws(() => parity.readClient(`${parity.BEGIN}\nprocess.exit(3); const SHOP_SKUS = [];\n${parity.END}`), /process is not defined/);
});

test('parity: today\'s app.js carries the client catalogue (§ 46), and it agrees with the server\'s', () => {
  const quiet = { log(){}, error(){} };
  assert.equal(parity.main([], quiet), 0);
  const client = parity.readClient(fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app.js'), 'utf8'));
  // Array.from: the block was evaluated in its own realm, and deepEqual compares prototypes.
  assert.deepEqual(Array.from(client, s => s.sku), catalog.SKUS.map(s => s.sku), 'the same skus, in the same order');
});

// ── webhook endpoint ──────────────────────────────────────────────────────
const hook = require('../../../scripts/create-webhook-endpoint');
const { HANDLED } = require('../../src/webhook');
const { STRIPE_API_VERSION } = require('../../src/config');

function fakeHooks(existing = []){
  const eps = [...existing], calls = [];
  return {
    eps, calls,
    webhookEndpoints: {
      list(q){ calls.push(['list', q]); const snap = [...eps]; return { async *[Symbol.asyncIterator](){ for(const e of snap) yield e; } }; },
      async create(p){ calls.push(['create', p]); const ep = { id: 'we_new', livemode: false, secret: 'test-signing-secret-from-fake', ...p }; eps.push(ep); return ep; },
      async del(id){ calls.push(['del', id]); eps.splice(eps.findIndex(e => e.id === id), 1); return { id, deleted: true }; }
    }
  };
}
const URL_ = 'https://point-invaders-shop.example.workers.dev/webhook';
const io = () => { const o = { stdout: '', stderr: [] }; o.out = s => { o.stdout += s; }; o.err = s => { o.stderr.push(s); }; return o; };

test('webhook endpoint: a dry run creates nothing and lists the seven handled events', async () => {
  const st = fakeHooks(), o = io();
  assert.equal(await hook.main([URL_], { STRIPE_SECRET_KEY: 'sk_test_abc' }, o, st), 0);
  assert.equal(st.calls.filter(c => c[0] === 'create').length, 0);
  assert.equal(o.stdout, '', 'nothing on stdout without --apply');
  assert.deepEqual([...hook.EVENTS].sort(), [...HANDLED].sort());
  assert.equal(hook.EVENTS.length, 7);
});

test('webhook endpoint: --apply creates it on the pinned API version and prints ONLY the secret, no newline', async () => {
  const st = fakeHooks(), o = io();
  assert.equal(await hook.main([URL_, '--apply'], { STRIPE_SECRET_KEY: 'sk_test_abc' }, o, st), 0);
  const [, params] = st.calls.find(c => c[0] === 'create');
  assert.equal(params.url, URL_);
  assert.equal(params.api_version, STRIPE_API_VERSION);
  assert.deepEqual([...params.enabled_events].sort(), [...HANDLED].sort());
  assert.equal(o.stdout, 'test-signing-secret-from-fake');
});

test('webhook endpoint: an existing endpoint for the URL is refused, or replaced with --replace', async () => {
  const old = { id: 'we_old', url: URL_ };
  let st = fakeHooks([old]), o = io();
  assert.equal(await hook.main([URL_, '--apply'], { STRIPE_SECRET_KEY: 'sk_test_abc' }, o, st), 2);
  assert.equal(st.calls.filter(c => c[0] === 'create').length, 0);
  st = fakeHooks([old]); o = io();
  assert.equal(await hook.main([URL_, '--apply', '--replace'], { STRIPE_SECRET_KEY: 'sk_test_abc' }, o, st), 0);
  assert.deepEqual(st.calls.filter(c => c[0] === 'del'), [['del', 'we_old']]);
  assert.equal(st.eps.length, 1);
  assert.equal(st.eps[0].id, 'we_new');
});

test('webhook endpoint: bad URL, missing key, and the live guard', async () => {
  const st = fakeHooks(), o = io();
  assert.equal(await hook.main(['http://example.com/webhook'], { STRIPE_SECRET_KEY: 'sk_test_abc' }, o, st), 2);
  assert.equal(await hook.main(['https://example.com/checkout'], { STRIPE_SECRET_KEY: 'sk_test_abc' }, o, st), 2);
  assert.equal(await hook.main([URL_], { STRIPE_SECRET_KEY: '' }, o, st), 2);
  assert.equal(await hook.main([URL_, '--apply'], { STRIPE_SECRET_KEY: 'sk_live_abc' }, o, st), 2);
  assert.equal(st.calls.length, 0);
});
