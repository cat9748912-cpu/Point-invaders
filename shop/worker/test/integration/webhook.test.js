'use strict';
// POST /webhook against the Database emulator, with payloads signed exactly as the
// provider signs them: grants, replays, refunds, disputes, ordering, duplicates,
// failures half way through, and the compare-and-swap that keeps concurrent
// deliveries from losing each other's writes.
const test = require('node:test');
const assert = require('node:assert/strict');
const { SKIP, dbFor, quietLog } = require('../helpers/emu');
const { fakeStripe, signedBody } = require('../helpers/fake-stripe');
const { request, read } = require('../helpers/http');
const E = require('../helpers/events');
const { createApp } = require('../../src/app');
const { makeLedger } = require('../../src/ledger');

const SECRET = 'test-signing-secret-integration';
const NS = 'demo-pi-webhook-default-rtdb';
let A;

/** A handler with a ledger whose calls are counted, and that can be told to fail once. */
function rig({ live = false, autoRefundDupes = true, app = A } = {}){
  const stripe = fakeStripe();
  const log = quietLog();
  const real = makeLedger(app.db);
  const count = {};
  const failOnce = new Set();
  const ledger = {};
  for(const k of Object.keys(real)){
    ledger[k] = async (...a) => {
      count[k] = (count[k] || 0) + 1;
      if(failOnce.has(k)){ failOnce.delete(k); throw Object.assign(new Error(`injected ${k} failure`), { code: 'injected' }); }
      return real[k](...a);
    };
  }
  const handler = createApp({ db: app.db, verifier: null, stripe, log, ledger,
                              cfg: { live, webhookSecret: SECRET, managed: true, autoRefundDupes, site: 'https://pointinvaders.com' } });
  async function deliver(evt, { secret = SECRET, raw, sig, method = 'POST' } = {}){
    const payload = raw !== undefined ? raw : JSON.stringify(evt);
    const headers = {};
    if(sig !== null) headers['Stripe-Signature'] = sig || signedBody(payload, secret);
    return read(await handler(request({ method, path: '/webhook', headers, raw: method === 'GET' ? undefined : payload })));
  }
  return { stripe, log, count, failOnce, deliver };
}

const get = async (p, app = A) => app.db.get(p);
const ent = (uid, sku) => get(`shop/ent/${uid}/${sku}`);
let seq = 0;
const newUid = () => `uid_${Date.now()}_${++seq}`;

test('webhook', { skip: SKIP, concurrency: false }, async t => {
  A = dbFor(NS);
  t.beforeEach(async () => { await A.clear(); });

  // ── Signature ─────────────────────────────────────────────────────────
  await t.test('a bad signature → 400 and nothing is written (wrong secret, tampered body, none)', async () => {
    const { deliver, count } = rig();
    const evt = E.completed(E.session({ uid: newUid(), sku: 'col_aurora' }));
    assert.equal((await deliver(evt, { secret: 'test-signing-secret-other' })).statusCode, 400);
    const payload = JSON.stringify(evt);
    const sig = signedBody(payload, SECRET);
    assert.equal((await deliver(evt, { raw: payload.replace('"paid"', '"PAID"'), sig })).statusCode, 400);
    assert.equal((await deliver(evt, { sig: null })).statusCode, 400);
    assert.equal(count.claimEvent || 0, 0);
    assert.equal(await get('shop'), null);
  });

  await t.test('the signature is checked over the RAW bytes: odd formatting that is correctly signed is accepted', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const evt = E.completed(E.session({ uid, sku: 'col_aurora' }));
    const raw = JSON.stringify(evt, null, 3) + '\n';           // not what JSON.stringify(req.body) would produce
    assert.equal((await deliver(evt, { raw })).statusCode, 200);
    assert.equal((await ent(uid, 'col_aurora')).s, 'active');
  });

  await t.test('GET → 405', async () => {
    assert.equal((await rig().deliver(null, { method: 'GET', raw: '' })).statusCode, 405);
  });

  // ── Grant ─────────────────────────────────────────────────────────────
  await t.test('checkout.session.completed (paid) → grant: entitlement, receipt line, payment-intent index, open session cleared', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'col_aurora', amount: 199 });
    await A.db.set(`shop/rl/${uid}/o/col_aurora`, { id: s.id, exp: 9e9 });
    const r = await deliver(E.completed(s));
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.ok, true);
    assert.equal(r.body.active, true);
    const e = await ent(uid, 'col_aurora');
    assert.equal(e.s, 'active');
    assert.deepEqual(e.ord, { [s.id]: 'paid' });
    assert.equal(e.p, 199); assert.equal(e.c, 'usd'); assert.equal(e.lm, false); assert.equal(e.o, s.id);
    assert.equal(typeof e.at, 'number');
    const line = await get(`shop/orders/${uid}/${s.id}`);
    assert.equal(line.sku, 'col_aurora'); assert.equal(line.s, 'paid'); assert.equal(line.amount, 199);
    assert.equal(line.pi, s.payment_intent); assert.equal(line.lm, false);
    assert.deepEqual(await get(`shop/pi/${s.payment_intent}`), { uid, sku: 'col_aurora', sid: s.id });
    assert.equal(await get(`shop/rl/${uid}/o/col_aurora`), null);
    assert.equal(await get(`shop/badge/${uid}`), null, 'only the pass lights the badge');
  });

  await t.test('the same event replayed → 200 duplicate, and no second write of any kind', async () => {
    const { deliver, count } = rig();
    const uid = newUid();
    const evt = E.completed(E.session({ uid, sku: 'skin_kitsune', amount: 299 }));
    assert.equal((await deliver(evt)).body.ok, true);
    const before = await get('shop');
    const writes = { apply: count.apply, writeOrder: count.writeOrder, indexPI: count.indexPI };
    const again = await deliver(evt);
    assert.equal(again.statusCode, 200);
    assert.deepEqual(again.body, { duplicate: true });
    assert.deepEqual({ apply: count.apply, writeOrder: count.writeOrder, indexPI: count.indexPI }, writes);
    const after = await get('shop');
    // the event record itself is unchanged too
    assert.deepEqual(after, before);
    assert.equal(after.events[evt.id].st, 'done');
  });

  await t.test('two deliveries of one event at the same moment: one is handled, the other is told to come back', async () => {
    const { deliver, count } = rig();
    const uid = newUid();
    const evt = E.completed(E.session({ uid, sku: 'col_ultra' }));
    const [a, b] = await Promise.all([deliver(evt), deliver(evt)]);
    const codes = [a.statusCode, b.statusCode].sort();
    assert.ok(JSON.stringify(codes) === '[200,409]' || JSON.stringify(codes) === '[200,200]', `got ${codes}`);
    assert.equal(count.apply, 1, 'the order was applied once');
    assert.equal((await ent(uid, 'col_ultra')).s, 'active');
  });

  await t.test('the pass lights the public badge with "supporter since"', async () => {
    const { deliver } = rig();
    const uid = newUid();
    await deliver(E.completed(E.session({ uid, sku: 'pass_supporter', amount: 499 })));
    const e = await ent(uid, 'pass_supporter');
    assert.equal(await get(`shop/badge/${uid}`), e.at);
  });

  // ── Revoke ────────────────────────────────────────────────────────────
  await t.test('charge.refunded (full) → revoked; the pass badge goes with it', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'pass_supporter', amount: 499 });
    await deliver(E.completed(s));
    const r = await deliver(E.refunded({ pi: s.payment_intent, amount: 499 }));
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.state, 'refunded');
    const e = await ent(uid, 'pass_supporter');
    assert.equal(e.s, 'revoked');
    assert.deepEqual(e.ord, { [s.id]: 'refunded' });
    assert.equal((await get(`shop/orders/${uid}/${s.id}`)).s, 'refunded');
    assert.equal(await get(`shop/badge/${uid}`), null);
  });

  await t.test('a partial refund keeps the item', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'wld_polar', amount: 399 });
    await deliver(E.completed(s));
    const r = await deliver(E.refunded({ pi: s.payment_intent, full: false, amount: 399 }));
    assert.equal(r.body.skipped, 'partial_refund');
    assert.equal((await ent(uid, 'wld_polar')).s, 'active');
  });

  await t.test('charge.dispute.created → revoked; closed won → restored; lost → gone for good', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'pass_supporter', amount: 499 });
    await deliver(E.completed(s));
    assert.equal((await deliver(E.disputeCreated({ pi: s.payment_intent }))).body.state, 'disputed');
    assert.equal((await ent(uid, 'pass_supporter')).s, 'revoked');
    assert.equal(await get(`shop/badge/${uid}`), null);
    assert.equal((await deliver(E.disputeClosed({ pi: s.payment_intent, status: 'won' }))).body.state, 'paid');
    assert.equal((await ent(uid, 'pass_supporter')).s, 'active');
    assert.equal(typeof (await get(`shop/badge/${uid}`)), 'number');

    const uid2 = newUid();
    const s2 = E.session({ uid: uid2, sku: 'cur_comet' });
    await deliver(E.completed(s2));
    await deliver(E.disputeCreated({ pi: s2.payment_intent }));
    assert.equal((await deliver(E.disputeClosed({ pi: s2.payment_intent, status: 'lost' }))).body.state, 'lost');
    assert.equal((await ent(uid2, 'cur_comet')).s, 'revoked');
    // nothing brings a lost order back
    assert.equal((await deliver(E.disputeClosed({ pi: s2.payment_intent, status: 'won' }))).body.state, 'lost');
    assert.equal((await ent(uid2, 'cur_comet')).s, 'revoked');
  });

  await t.test('an inquiry that closes without a dispute restores the item', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'col_aurora' });
    await deliver(E.completed(s));
    await deliver(E.disputeCreated({ pi: s.payment_intent }));
    await deliver(E.disputeClosed({ pi: s.payment_intent, status: 'warning_closed' }));
    assert.equal((await ent(uid, 'col_aurora')).s, 'active');
  });

  await t.test('a dispute without a payment intent is traced through its charge', async () => {
    const { deliver, stripe } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'col_aurora' });
    await deliver(E.completed(s));
    stripe.chargeStore.set('ch_trace', { id: 'ch_trace', payment_intent: s.payment_intent });
    const r = await deliver(E.disputeCreated({ pi: s.payment_intent, charge: 'ch_trace', withPI: false }));
    assert.equal(r.body.state, 'disputed');
    assert.equal(stripe.callsOf('charges.retrieve').length, 1);
  });

  // ── Order and delay ───────────────────────────────────────────────────
  await t.test('a refund that arrives BEFORE the completion: recorded refunded, and the late completion grants nothing', async () => {
    const { deliver, stripe } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'skin_unicorn', amount: 299 });
    stripe.intents.set(s.payment_intent, { id: s.payment_intent, metadata: { uid, sku: 'skin_unicorn', v: '1' } });
    stripe.sessions.set(s.id, { ...s });
    const r = await deliver(E.refunded({ pi: s.payment_intent, amount: 299 }));
    assert.equal(r.body.state, 'refunded');
    assert.equal(stripe.callsOf('paymentIntents.retrieve').length, 1, 'traced through the payment intent metadata');
    const late = await deliver(E.completed(s));
    assert.equal(late.body.state, 'refunded');
    assert.equal(late.body.changed, false);
    assert.equal((await ent(uid, 'skin_unicorn')).s, 'revoked');
    assert.equal((await get(`shop/orders/${uid}/${s.id}`)).amount, 299, 'the late completion still fills in the receipt');
  });

  await t.test('a refund for a payment that is not ours (no metadata) is ignored', async () => {
    const { deliver, stripe } = rig();
    stripe.intents.set('pi_other', { id: 'pi_other', metadata: {} });
    const r = await deliver(E.refunded({ pi: 'pi_other' }));
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.skipped, 'not_ours');
  });

  await t.test('a delayed payment method: pending grants nothing; success grants; failure never does', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'col_ultra', paid: false });
    assert.equal((await deliver(E.completed(s))).body.state, 'pending');
    assert.equal((await ent(uid, 'col_ultra')).s, 'revoked');
    assert.equal((await deliver(E.asyncSucceeded(s))).body.state, 'paid');
    assert.equal((await ent(uid, 'col_ultra')).s, 'active');

    const uid2 = newUid();
    const s2 = E.session({ uid: uid2, sku: 'col_ultra', paid: false });
    await deliver(E.completed(s2));
    assert.equal((await deliver(E.asyncFailed(s2))).body.state, 'failed');
    assert.equal((await ent(uid2, 'col_ultra')).s, 'revoked');
  });

  await t.test('checkout.session.expired forgets the open session, if it is still that one', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'col_aurora', paid: false });
    await A.db.set(`shop/rl/${uid}/o/col_aurora`, { id: s.id, exp: 9e9 });
    await A.db.set(`shop/rl/${uid}/o/cur_comet`, { id: 'cs_other', exp: 9e9 });
    assert.equal((await deliver(E.expired(s))).body.expired, true);
    assert.equal(await get(`shop/rl/${uid}/o/col_aurora`), null);
    assert.deepEqual(await get(`shop/rl/${uid}/o/cur_comet`), { id: 'cs_other', exp: 9e9 });
  });

  // ── Duplicates ────────────────────────────────────────────────────────
  await t.test('paid twice for one item: the second payment is refunded automatically, the item stays', async () => {
    const { deliver, stripe } = rig();
    const uid = newUid();
    const s1 = E.session({ uid, sku: 'cur_comet' });
    const s2 = E.session({ uid, sku: 'cur_comet' });
    await deliver(E.completed(s1));
    const r = await deliver(E.completed(s2));
    assert.equal(r.body.dup, true);
    assert.match(r.body.refund, /^re_fake_/);
    const [call] = stripe.callsOf('refunds.create');
    assert.deepEqual(call.args[0], { payment_intent: s2.payment_intent, reason: 'duplicate',
                                     metadata: { uid, sku: 'cur_comet', sid: s2.id, why: 'duplicate_purchase' } });
    assert.deepEqual(call.args[1], { idempotencyKey: 'dup-refund:' + s2.payment_intent });
    const line = await get(`shop/orders/${uid}/${s2.id}`);
    assert.equal(line.d, 1);
    assert.equal(line.r, r.body.refund);
    // the refund's own webhook then closes the duplicate; the first order still owns the item
    await deliver(E.refunded({ pi: s2.payment_intent }));
    const e = await ent(uid, 'cur_comet');
    assert.deepEqual(e.ord, { [s1.id]: 'paid', [s2.id]: 'refunded' });
    assert.equal(e.s, 'active');
  });

  await t.test('with auto-refund off, a duplicate is flagged but not refunded', async () => {
    const { deliver, stripe } = rig({ autoRefundDupes: false });
    const uid = newUid();
    await deliver(E.completed(E.session({ uid, sku: 'cur_comet' })));
    const s2 = E.session({ uid, sku: 'cur_comet' });
    const r = await deliver(E.completed(s2));
    assert.equal(r.body.dup, true);
    assert.equal(r.body.refund, null);
    assert.equal(stripe.callsOf('refunds.create').length, 0);
    assert.equal((await get(`shop/orders/${uid}/${s2.id}`)).d, 1);
  });

  await t.test('the duplicate refund fails → 500, the claim is released, and the redelivery refunds', async () => {
    const { deliver, stripe } = rig();
    const uid = newUid();
    await deliver(E.completed(E.session({ uid, sku: 'col_aurora' })));
    const s2 = E.session({ uid, sku: 'col_aurora' });
    const evt = E.completed(s2);
    stripe.failNext('refunds.create');
    const first = await deliver(evt);
    assert.equal(first.statusCode, 500);
    assert.equal(await get(`shop/events/${evt.id}`), null, 'the claim was released');
    const second = await deliver(evt);
    assert.equal(second.statusCode, 200);
    assert.match(second.body.refund, /^re_fake_/);
    const calls = stripe.callsOf('refunds.create');
    assert.equal(calls.length, 2);
    assert.equal(calls[0].args[1].idempotencyKey, calls[1].args[1].idempotencyKey, 'the same idempotency key: one refund at the provider');
  });

  // ── Failures half way ─────────────────────────────────────────────────
  await t.test('the database fails after the grant → 500; the redelivery completes the rest', async () => {
    const { deliver, failOnce } = rig();
    const uid = newUid();
    const s = E.session({ uid, sku: 'skin_kitsune', amount: 299 });
    const evt = E.completed(s);
    failOnce.add('writeOrder');
    const first = await deliver(evt);
    assert.equal(first.statusCode, 500);
    assert.equal((await ent(uid, 'skin_kitsune')).s, 'active', 'the transaction itself had committed');
    assert.equal(await get(`shop/orders/${uid}/${s.id}`), null);
    const second = await deliver(evt);
    assert.equal(second.statusCode, 200);
    assert.equal(second.body.changed, false, 'the grant is not applied twice');
    assert.equal((await get(`shop/orders/${uid}/${s.id}`)).s, 'paid');
    assert.deepEqual(await get(`shop/pi/${s.payment_intent}`), { uid, sku: 'skin_kitsune', sid: s.id });
  });

  await t.test('a fresh claim held by another delivery → 409; a stale one is taken over', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const evt = E.completed(E.session({ uid, sku: 'col_aurora' }));
    await A.db.set(`shop/events/${evt.id}`, { t: evt.type, st: 'claimed', at: Date.now(), lm: false });
    assert.equal((await deliver(evt)).statusCode, 409);
    await A.db.set(`shop/events/${evt.id}/at`, Date.now() - 10 * 60 * 1000);
    assert.equal((await deliver(evt)).statusCode, 200);
    assert.equal((await ent(uid, 'col_aurora')).s, 'active');
  });

  // ── Things that are not ours, or not for this mode ────────────────────
  await t.test('a live event at a test endpoint (or the reverse) is ignored', async () => {
    const { deliver } = rig({ live: false });
    const uid = newUid();
    const r = await deliver(E.completed(E.session({ uid, sku: 'col_aurora', livemode: true }), { livemode: true }));
    assert.deepEqual(r.body, { ignored: 'mode' });
    assert.equal(await get('shop'), null);
    const live = rig({ live: true });
    const r2 = await live.deliver(E.completed(E.session({ uid, sku: 'col_aurora' })));
    assert.deepEqual(r2.body, { ignored: 'mode' });
  });

  await t.test('an event type the shop does not handle is acknowledged and not recorded', async () => {
    const r = await rig().deliver(E.event('payment_intent.succeeded', { id: 'pi_x' }));
    assert.deepEqual(r.body, { ignored: 'type' });
    assert.equal(await get('shop'), null);
  });

  await t.test('a session the server did not create (no metadata version, uid mismatch, unknown sku) unlocks nothing', async () => {
    const { deliver } = rig();
    const uid = newUid();
    const noVersion = E.session({ uid, sku: 'col_aurora' });
    delete noVersion.metadata.v;                      // (passing v: undefined would just pick up the default)
    for(const s of [noVersion,
                    { ...E.session({ uid, sku: 'col_aurora' }), client_reference_id: 'someone_else' },
                    E.session({ uid, sku: 'gold_bars' }),
                    E.session({ uid, sku: 'col_aurora', mode: 'subscription' })]){
      const r = await deliver(E.completed(s));
      assert.equal(r.statusCode, 200);
      assert.equal(r.body.skipped, 'not_ours');
    }
    assert.equal(await get(`shop/ent/${uid}`), null);
  });

  // ── Compare-and-swap (see rtdb.js) ───────────────────────────────────
  await t.test('compare-and-swap: a write that lands between the read and the write is not lost', async () => {
    const path = 'shop/ent/cas/col_aurora';
    await A.db.set(path, { ord: { cs_a: 'paid' }, s: 'active' });
    // A client whose FIRST conditional write is preceded by someone else's write.
    let interfered = false;
    const sneaky = dbFor(NS, async (url, init) => {
      if(!interfered && init && init.method === 'PUT' && init.headers && init.headers['if-match']){
        interfered = true;
        await A.db.update(path + '/ord', { cs_b: 'paid' });
      }
      return fetch(url, init);
    });
    const seen = [];
    const r = await sneaky.db.transaction(path, cur => { seen.push(Object.keys(cur.ord).sort().join()); cur.ord.cs_c = 'paid'; return cur; });
    assert.equal(r.committed, true);
    assert.deepEqual(seen, ['cs_a', 'cs_a,cs_b'], 'refused once (412), then re-run on what the server held');
    assert.deepEqual(Object.keys((await get(path)).ord).sort(), ['cs_a', 'cs_b', 'cs_c'], 'both writes are there');
  });

  await t.test('concurrent deliveries for one player and item: every order lands, the item stays active', async () => {
    const uid = newUid();
    const sessions = [1, 2, 3, 4].map(() => E.session({ uid, sku: 'col_aurora' }));
    const results = await Promise.all(sessions.map(s => rig({ autoRefundDupes: false }).deliver(E.completed(s))));
    assert.deepEqual(results.map(r => r.statusCode), [200, 200, 200, 200]);
    const node = await ent(uid, 'col_aurora');
    assert.deepEqual(Object.keys(node.ord).sort(), sessions.map(s => s.id).sort());
    assert.equal(node.s, 'active');
    assert.equal(Object.keys(node.dups || {}).length, 3, 'one first purchase, three duplicates flagged');
  });
});
