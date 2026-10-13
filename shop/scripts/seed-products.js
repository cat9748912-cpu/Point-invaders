#!/usr/bin/env node
'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🌱 SEED PRODUCTS — the provider's catalogue, made to match ours
// ══════════════════════════════════════════════════════════════════════
// For every SKU in worker/src/catalog.js, makes sure the provider has:
//   · a PRODUCT  (metadata.pi_sku = sku) with the name, description and tax code;
//   · an active PRICE with lookup_key = sku, the amount in USD, tax INCLUSIVE.
//
// Test and live mode are separate worlds at the provider. Which one this
// touches is decided by the key alone: run it once with a test key at Gate 1
// and once with a live key at go-live. Nothing here ever stores a price id;
// the checkout finds prices by lookup key.
//
// A price's amount and tax behaviour cannot be edited once it exists, so a
// changed price is a NEW price that takes over the lookup key
// (transfer_lookup_key), and the old one is archived. Buyers with a checkout
// page already open finish at the old price; everyone after sees the new one.
//
// Usage (from shop/, or from shop/worker as ../scripts/…, after `npm ci` in shop/worker):
//   read -rs STRIPE_SECRET_KEY && export STRIPE_SECRET_KEY        # macOS/Linux: paste the key; not echoed, not in history
//   set /p STRIPE_SECRET_KEY=Paste the key:                       # Windows Command Prompt (shown while pasted, not saved)
//   node scripts/seed-products.js                  # DRY RUN: prints what it would do, changes nothing
//   node scripts/seed-products.js --apply          # does it (test key)
//   node scripts/seed-products.js --apply --live   # does it (live key; refused without --live)
//
// The key needs write access to Products and Prices. The Worker's own
// restricted key does not have it, by design: use a separate key for this.
const path = require('node:path');

const WORKER = path.join(__dirname, '..', 'worker');
const catalog = require(path.join(WORKER, 'src', 'catalog.js'));

/** What the product should look like. */
function wantProduct(s){
  return { name: s.name, description: s.desc, tax_code: s.taxCode, active: true,
           metadata: { pi_sku: s.sku, pi_kind: s.kind } };
}
/** What the price should look like. */
function wantPrice(s){
  return { unit_amount: s.amount, currency: s.currency, tax_behavior: 'inclusive', lookup_key: s.lookupKey };
}

const idOf = x => (typeof x === 'string' ? x : (x && x.id) || null);
const productDiffers = (p, w) =>
  p.name !== w.name || (p.description || '') !== w.description || idOf(p.tax_code) !== w.tax_code ||
  p.active !== true || !p.metadata || p.metadata.pi_sku !== w.metadata.pi_sku || p.metadata.pi_kind !== w.metadata.pi_kind;
const priceDiffers = (pr, w, productId) =>
  pr.unit_amount !== w.unit_amount || pr.currency !== w.currency || pr.tax_behavior !== w.tax_behavior ||
  pr.active !== true || idOf(pr.product) !== productId;

/** Every product the account has that carries one of our skus. */
async function ourProducts(stripe){
  const out = new Map();
  for await (const p of stripe.products.list({ limit: 100 })){
    const sku = p.metadata && p.metadata.pi_sku;
    if(sku && !out.has(sku)) out.set(sku, p);
  }
  return out;
}

/**
 * Works out, without changing anything, what has to happen for each SKU.
 * @returns {Promise<Array<{sku:string, product:object|null, price:object|null, productAction:string, priceAction:string}>>}
 */
async function plan(stripe, skus = catalog.SKUS){
  catalog.validate(skus);
  const products = await ourProducts(stripe);
  const steps = [];
  for(const s of skus){
    const product = products.get(s.sku) || null;
    const list = await stripe.prices.list({ lookup_keys: [s.lookupKey], limit: 1 });
    const price = (list && list.data && list.data[0]) || null;
    const wp = wantProduct(s), wpr = wantPrice(s);
    const productAction = !product ? 'create' : productDiffers(product, wp) ? 'update' : 'ok';
    let priceAction;
    if(!price) priceAction = 'create';
    else if(!product || priceDiffers(price, wpr, product.id)) priceAction = 'replace';
    else priceAction = 'ok';
    steps.push({ sku: s.sku, item: s, product, price, productAction, priceAction });
  }
  return steps;
}

/** Carries the plan out. Returns the final product and price id of each SKU. */
async function apply(stripe, steps){
  const done = [];
  for(const st of steps){
    const s = st.item, wp = wantProduct(s), wpr = wantPrice(s);
    let productId = st.product && st.product.id;
    if(st.productAction === 'create'){
      productId = (await stripe.products.create(wp)).id;
    }else if(st.productAction === 'update'){
      await stripe.products.update(productId, wp);
    }
    let priceId = st.price && st.price.id;
    if(st.priceAction === 'create' || st.priceAction === 'replace'){
      const created = await stripe.prices.create({
        product: productId, unit_amount: wpr.unit_amount, currency: wpr.currency, tax_behavior: wpr.tax_behavior,
        lookup_key: wpr.lookup_key, transfer_lookup_key: st.priceAction === 'replace', metadata: { pi_sku: s.sku }
      });
      if(st.priceAction === 'replace' && st.price && st.price.active) await stripe.prices.update(st.price.id, { active: false });
      priceId = created.id;
    }
    done.push({ sku: s.sku, productId, priceId });
  }
  return done;
}

function modeOf(key){
  if(/^(sk|rk)_live_/.test(key)) return 'live';
  if(/^(sk|rk)_test_/.test(key)) return 'test';
  return null;
}

function table(steps){
  const rows = steps.map(st => [st.sku, catalog.priceLabel(st.item), st.productAction, st.priceAction]);
  const head = ['sku', 'price', 'product', 'price object'];
  const w = head.map((h, i) => Math.max(h.length, ...rows.map(r => String(r[i]).length)));
  const line = r => r.map((c, i) => String(c).padEnd(w[i])).join('  ');
  return [line(head), line(w.map(n => '-'.repeat(n))), ...rows.map(line)].join('\n');
}

async function main(argv = process.argv.slice(2), env = process.env, out = console){
  const doApply = argv.includes('--apply'), wantLive = argv.includes('--live');
  const key = env.STRIPE_SECRET_KEY || '';
  const mode = modeOf(key);
  if(!mode){ out.error('STRIPE_SECRET_KEY is missing or is not a Stripe secret/restricted key.'); return 2; }
  if(mode === 'live' && !wantLive){ out.error('Refusing: that is a LIVE key. Add --live if you mean it.'); return 2; }
  if(mode === 'test' && wantLive){ out.error('Refusing: --live given with a TEST key.'); return 2; }

  const Stripe = require(require.resolve('stripe', { paths: [WORKER] }));
  const { STRIPE_API_VERSION } = require(path.join(WORKER, 'src', 'config.js'));
  const stripe = new Stripe(key, { apiVersion: STRIPE_API_VERSION, maxNetworkRetries: 2 });

  const steps = await plan(stripe);
  out.log(`Mode: ${mode.toUpperCase()}   ${doApply ? 'APPLYING' : 'DRY RUN (add --apply to make these changes)'}\n`);
  out.log(table(steps));
  const todo = steps.filter(s => s.productAction !== 'ok' || s.priceAction !== 'ok').length;
  if(!doApply){ out.log(`\n${todo} SKU(s) need changes.`); return 0; }
  const done = await apply(stripe, steps);
  out.log('\nDone:');
  for(const d of done) out.log(`  ${d.sku.padEnd(16)} product ${d.productId}   price ${d.priceId}`);
  return 0;
}

if(require.main === module){
  main().then(code => { process.exitCode = code; }, e => { console.error(e && e.message || e); process.exitCode = 1; });
}

module.exports = { plan, apply, main, modeOf, wantProduct, wantPrice };
