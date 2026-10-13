'use strict';
// ══════════════════════════════════════════════════════════════════════
//  📒 ORDERS — one monotonic state machine, and what it says you own
// ══════════════════════════════════════════════════════════════════════
// Pure functions, no database: the ledger runs applyToNode() INSIDE a
// transaction on shop/ent/<uid>/<sku>, so this is the whole of the logic that
// decides whether a player owns something.
//
// Each SKU's node keeps a small map of that SKU's orders (checkout session id
// → state). The entitlement is derived from the map, never stored beside it as
// a second opinion:  active  ⇔  some order is `paid`.
//
// States only move forward, and `refunded` / `lost` are terminal. That one
// property is what makes the webhook safe to replay and safe to receive out of
// order: a refund that arrives before the completion leaves a refunded order
// the late completion cannot revive, and a completion delivered twice finds
// its order already `paid` and changes nothing.
//
//   (none)   ──completed, paid──────────▶ paid
//   (none)   ──completed, unpaid────────▶ pending      (a delayed payment method)
//   pending  ──async payment succeeded──▶ paid
//   pending  ──async payment failed─────▶ failed
//   paid     ──dispute opened───────────▶ disputed     (revokes)
//   disputed ──dispute won / inquiry closed──▶ paid    (restores)
//   disputed ──dispute lost─────────────▶ lost ■
//   anything but ■ ──full refund────────▶ refunded ■
//   (none)   ──refund or dispute seen first──▶ refunded ■ / disputed

/** The events the ledger understands, already translated from the provider's. */
const EV = Object.freeze({
  PAID: 'paid',          // checkout completed and paid, or a delayed payment succeeded
  PENDING: 'pending',    // checkout completed, payment still on its way
  FAILED: 'failed',      // the delayed payment failed
  REFUND: 'refund',      // the charge was refunded IN FULL
  DISPUTE: 'dispute',    // a dispute (or an inquiry) was opened
  WON: 'won',            // the dispute closed in our favour, or the inquiry closed
  LOST: 'lost'           // the dispute closed against us
});

const TERMINAL = new Set(['refunded', 'lost']);

/**
 * The next state of one order. Anything not listed in the table above leaves it where it is.
 * @param {?string} cur  the order's state, or null if this node has never seen it
 * @param {string} ev    one of EV
 * @returns {?string}
 */
function next(cur, ev){
  if(cur && TERMINAL.has(cur)) return cur;
  switch(ev){
    case EV.PAID:    return (cur === null || cur === 'pending') ? 'paid' : cur;
    case EV.PENDING: return cur === null ? 'pending' : cur;
    case EV.FAILED:  return (cur === null || cur === 'pending') ? 'failed' : cur;
    case EV.REFUND:  return 'refunded';
    case EV.DISPUTE: return (cur === null || cur === 'paid' || cur === 'pending') ? 'disputed' : cur;
    case EV.WON:     return cur === 'disputed' ? 'paid' : cur;
    // A lost dispute whose opening we never saw still ends the order.
    case EV.LOST:    return (cur === null || cur === 'paid' || cur === 'disputed') ? 'lost' : cur;
    default:         return cur;
  }
}

/** @param {Record<string,string>|undefined|null} ord */
function isActive(ord){
  return !!ord && Object.keys(ord).some(k => ord[k] === 'paid');
}

/**
 * Applies one event to one SKU's entitlement node.
 * Returns `node: null` when nothing changes, which the ledger turns into an
 * aborted (no-op) transaction.
 *
 * `dup` is true when this event makes a SECOND order of the same SKU `paid`:
 * the player paid twice for one unlock. The sid is remembered in `dups` in the
 * same write, so the refund that follows can be retried from the node itself.
 *
 * @param {object|null} cur   the node as the transaction sees it
 * @param {string} sid        checkout session id (the order key)
 * @param {string} ev         one of EV
 * @param {number} t          server time, ms
 * @param {{amount?:number, currency?:string, lm?:boolean}} [meta]  the order's money, recorded when it is paid
 */
function applyToNode(cur, sid, ev, t, meta){
  const prev = (cur && typeof cur === 'object') ? cur : null;
  const ord = { ...((prev && prev.ord) || {}) };
  const before = Object.prototype.hasOwnProperty.call(ord, sid) ? ord[sid] : null;
  const after = next(before, ev);
  if(after === before) return { node: null, before, after, dup: false };

  const dup = after === 'paid' && ev === EV.PAID && Object.keys(ord).some(k => k !== sid && ord[k] === 'paid');
  ord[sid] = after;
  const active = isActive(ord);
  const node = { ...(prev || {}), ord, s: active ? 'active' : 'revoked', u: t, o: sid };
  // `at` is when the CURRENT run of ownership began: a pass bought again after a
  // refund is "supporter since" the new purchase, not the refunded one.
  if(active && !(prev && prev.s === 'active')) node.at = t;
  if(after === 'paid' && meta){
    if(Number.isInteger(meta.amount)) node.p = meta.amount;
    if(typeof meta.currency === 'string') node.c = meta.currency;
    node.lm = !!meta.lm;
  }
  if(dup) node.dups = { ...((prev && prev.dups) || {}), [sid]: 1 };
  return { node, before, after, dup };
}

module.exports = { EV, TERMINAL, next, isActive, applyToNode };
