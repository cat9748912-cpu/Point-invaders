'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🔔 POST /webhook — the only door through which anything is unlocked
// ══════════════════════════════════════════════════════════════════════
// The provider tells us what happened to a payment; this turns it into one
// transition of one order (orders.js) and writes the result. Nothing else in
// the system can grant or revoke a paid item.
//
//   1. VERIFY the signature over the RAW body. Anything else is 400.
//   2. CLAIM the event id (shop/events/<id>). Already done → 200, nothing
//      happens: that is a replay. Being handled right now → 409, and the
//      provider retries later.
//   3. ACT: one transaction on the SKU's entitlement node, then the
//      idempotent follow-ups (receipt line, payment-intent index, badge, and
//      the refund of a duplicate payment).
//   4. FINISH the claim, and only then answer 2xx. A failure anywhere in 3
//      releases the claim and answers 500, so the provider delivers again and
//      the whole thing re-runs. Every step in 3 is safe to repeat.
//
// Events this endpoint is subscribed to (RUNBOOK.md lists the same seven):
const catalog = require('./catalog');
const { EV } = require('./orders');
const { send } = require('./http');

const HANDLED = Object.freeze(new Set([
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'checkout.session.expired',
  'charge.refunded',
  'charge.dispute.created',
  'charge.dispute.closed'
]));

/** @param {object} deps  { stripe, ledger, cfg:{live, webhookSecret, autoRefundDupes}, log, now } */
async function handleWebhook(req, res, deps){
  const { stripe, ledger, cfg, log } = deps;
  if(req.method !== 'POST') return send(res, 405, { error: 'method' });

  const sig = req.get('stripe-signature');
  if(!sig || !req.rawBody) return send(res, 400, { error: 'signature' });
  let event;
  try{
    event = stripe.webhooks.constructEvent(req.rawBody, sig, cfg.webhookSecret);
  }catch(e){
    log.warn('webhook: signature rejected', { reason: e && e.message });
    return send(res, 400, { error: 'signature' });
  }

  const ctx = { id: event.id, type: event.type };
  // Test and live each have their own endpoint and secret, so a mismatch means
  // a misconfiguration: never let a test payment unlock anything in live, or
  // the reverse.
  if(!!event.livemode !== !!cfg.live){
    log.error('webhook: livemode does not match the key', { ...ctx, livemode: !!event.livemode });
    return send(res, 200, { ignored: 'mode' });
  }
  if(!HANDLED.has(event.type)) return send(res, 200, { ignored: 'type' });

  let claim;
  try{ claim = await ledger.claimEvent(event.id, event.type, event.livemode); }
  catch(e){
    log.error('webhook: could not claim the event', { ...ctx, error: e && e.message });
    return send(res, 500, { error: 'retry' });
  }
  if(claim === 'done') return send(res, 200, { duplicate: true });
  if(claim === 'busy') return send(res, 409, { error: 'busy' });

  try{
    const out = await dispatch(event, deps);
    await ledger.finishEvent(event.id);
    log.info('webhook: handled', { ...ctx, ...out });
    return send(res, 200, { ok: true, ...out });
  }catch(e){
    log.error('webhook: failed, provider will retry', { ...ctx, error: e && e.message, code: e && e.code });
    try{ await ledger.releaseEvent(event.id); }catch(x){ /* a stale claim is taken over by the retry anyway */ }
    return send(res, 500, { error: 'retry' });
  }
}

/** Provider event → ledger event. Returns a small summary for the log and the response. */
async function dispatch(event, deps){
  const o = (event.data && event.data.object) || {};
  switch(event.type){
    case 'checkout.session.completed':
      return onSession(o, deps, o.payment_status === 'paid' ? EV.PAID : o.payment_status === 'unpaid' ? EV.PENDING : null);
    case 'checkout.session.async_payment_succeeded':
      return onSession(o, deps, EV.PAID);
    case 'checkout.session.async_payment_failed':
      return onSession(o, deps, EV.FAILED);
    case 'checkout.session.expired':
      return onExpired(o, deps);
    case 'charge.refunded':
      // A partial refund (goodwill on part of the amount) keeps the item; only a full one revokes.
      if(o.refunded !== true) return { skipped: 'partial_refund', charge: o.id, amount_refunded: o.amount_refunded };
      return onPayment(idOf(o.payment_intent), EV.REFUND, deps, { charge: o.id });
    case 'charge.dispute.created':
      return onPayment(await disputePI(o, deps), EV.DISPUTE, deps, { dispute: o.id });
    case 'charge.dispute.closed': {
      const ev = o.status === 'lost' ? EV.LOST : (o.status === 'won' || o.status === 'warning_closed') ? EV.WON : null;
      return onPayment(await disputePI(o, deps), ev, deps, { dispute: o.id, status: o.status });
    }
    default:
      return { skipped: 'type' };
  }
}

/** A checkout session is ours when the server wrote it: our metadata version, a uid
 *  that matches client_reference_id, a SKU in the catalogue. A Payment Link made by
 *  hand in the dashboard, or any other product on the account, is not. */
function ours(s){
  const m = (s && s.metadata) || {};
  const item = catalog.find(m.sku);
  if(!s || s.mode !== 'payment' || m.v !== catalog.CATALOG_VERSION || !m.uid || m.uid !== s.client_reference_id || !item) return null;
  return { uid: m.uid, sku: item.sku, sid: s.id };
}

const idOf = x => (typeof x === 'string' ? x : (x && x.id) || null);

async function onSession(s, deps, ev){
  const { ledger, stripe, cfg, now } = deps;
  const who = ours(s);
  if(!who) return { skipped: 'not_ours', sid: s && s.id };
  if(!ev) return { skipped: 'no_transition', sid: s.id, payment_status: s.payment_status };
  const { uid, sku, sid } = who;
  const pi = idOf(s.payment_intent);

  const r = await ledger.apply({ uid, sku, sid, ev, meta: { amount: s.amount_total, currency: s.currency, lm: !!s.livemode } });
  const dup = !!(r.node && r.node.dups && r.node.dups[sid]);

  const line = { sku, s: r.after, u: now(), lm: !!s.livemode };
  if(Number.isInteger(s.amount_total)) line.amount = s.amount_total;
  if(typeof s.currency === 'string') line.currency = s.currency;
  if(Number.isInteger(s.created)) line.at = s.created * 1000;
  if(pi) line.pi = pi;
  if(dup) line.d = 1;
  await ledger.writeOrder(uid, sid, line);
  if(pi) await ledger.indexPI(pi, { uid, sku, sid });
  await ledger.clearOpen(uid, sku, sid);
  if(sku === catalog.PASS_SKU) await ledger.syncBadge(uid);

  // Paid twice for one unlock: give the second payment back. Decided from the
  // committed node (dups), not from this delivery, so a retry after a failed
  // refund call still refunds; the idempotency key makes repeating it free.
  let refund = null;
  if(dup && cfg.autoRefundDupes && pi && r.node.ord && r.node.ord[sid] === 'paid'){
    refund = await stripe.refunds.create(
      { payment_intent: pi, reason: 'duplicate', metadata: { uid, sku, sid, why: 'duplicate_purchase' } },
      { idempotencyKey: 'dup-refund:' + pi });
    await ledger.writeOrder(uid, sid, { r: refund.id });
  }
  return { uid, sku, sid, state: r.after, changed: r.changed, active: !!(r.node && r.node.s === 'active'),
           dup, refund: refund ? refund.id : null };
}

async function onExpired(s, deps){
  const who = ours(s);
  if(!who) return { skipped: 'not_ours', sid: s && s.id };
  await deps.ledger.clearOpen(who.uid, who.sku, who.sid);
  return { uid: who.uid, sku: who.sku, sid: who.sid, expired: true };
}

/** A refund or a dispute, traced back to its order through the payment intent. */
async function onPayment(pi, ev, deps, info){
  if(!ev) return { skipped: 'no_transition', ...info };
  if(!pi) return { skipped: 'no_payment_intent', ...info };
  const who = await resolvePI(pi, deps);
  if(!who) return { skipped: 'not_ours', pi, ...info };
  const { uid, sku, sid } = who;
  const r = await deps.ledger.apply({ uid, sku, sid, ev });
  await deps.ledger.writeOrder(uid, sid, { sku, s: r.after, u: deps.now(), pi });
  await deps.ledger.indexPI(pi, { uid, sku, sid });
  if(sku === catalog.PASS_SKU) await deps.ledger.syncBadge(uid);
  return { uid, sku, sid, state: r.after, changed: r.changed, active: !!(r.node && r.node.s === 'active'), ...info };
}

/**
 * payment intent → { uid, sku, sid }. Normally the index the completion wrote.
 * If the completion has not been processed yet (the provider does not promise
 * order), the payment intent carries the same metadata, and the session is
 * found from it: the order is then recorded in its final state at once, and the
 * late completion cannot grant it.
 */
async function resolvePI(pi, deps){
  const hit = await deps.ledger.lookupPI(pi);
  if(hit && hit.uid && hit.sku && hit.sid) return hit;
  const intent = await deps.stripe.paymentIntents.retrieve(pi);
  const m = (intent && intent.metadata) || {};
  const item = catalog.find(m.sku);
  if(!m.uid || !item || m.v !== catalog.CATALOG_VERSION) return null;
  const list = await deps.stripe.checkout.sessions.list({ payment_intent: pi, limit: 1 });
  const s = list && list.data && list.data[0];
  if(!s || s.client_reference_id !== m.uid) return null;
  return { uid: m.uid, sku: item.sku, sid: s.id };
}

async function disputePI(d, deps){
  const pi = idOf(d.payment_intent);
  if(pi) return pi;
  const ch = idOf(d.charge);
  if(!ch) return null;
  const charge = await deps.stripe.charges.retrieve(ch);
  return idOf(charge && charge.payment_intent);
}

module.exports = { handleWebhook, dispatch, HANDLED, ours };
