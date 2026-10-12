'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🗄️ THE LEDGER — every database read and write the shop makes
// ══════════════════════════════════════════════════════════════════════
// All of it under the top-level node `shop`, all of it through the Admin SDK,
// which the security rules do not apply to. Clients may READ shop/ent/<own
// uid>, shop/orders/<own uid>, shop/badge and shop/cfg, and may write nothing
// here at all (database.rules.json).
//
//   shop/cfg                 { open }                       the kill switch; missing = open
//   shop/badge/<uid>         <ms supporter since>           public: the ◆ chip
//   shop/ent/<uid>/<sku>     { s, at, u, o, p, c, lm, ord, dups }
//   shop/orders/<uid>/<sid>  { sku, s, u, amount, currency, pi, at, lm, d, r }
//   shop/events/<eventId>    { t, st, at, lm, done }        webhook idempotency
//   shop/pi/<paymentIntent>  { uid, sku, sid }              charge / dispute → order
//   shop/rl/<uid>            { at, o: { <sku>: { id, exp } } }   rate limit, open sessions
//
// ⚠️ TRANSACTIONS AND THE FIRST NULL. A transaction's update function is first
// called with whatever this process has cached, which for a path nobody is
// listening to is null, whatever the server holds. Returning undefined there
// ABORTS on the spot, without the server ever being asked, so a "no change"
// verdict reached against that null could silently drop a real change (a won
// dispute for an order that looks absent locally). So "no change" against a
// null is written as null instead: committing null over null is harmless, and
// over real data it fails the server's hash check and the function runs again
// with the true value. `keep()` below is that rule.
const { applyToNode } = require('./orders');
const { PASS_SKU } = require('./catalog');
const { RATE_MS, CLAIM_STALE_MS } = require('./config');

/** "Leave it as it is", spelled safely for a transaction (see above). */
const keep = cur => (cur === null ? null : undefined);

/**
 * @param {import('firebase-admin/database').Database} db
 * @param {() => number} [now]
 */
function makeLedger(db, now = Date.now){
  const ref = p => db.ref('shop/' + p);
  const val = async p => (await ref(p).once('value')).val();

  return {
    /** The Console kill switch. Anything but an explicit false is open. */
    async shopOpen(){ return (await val('cfg/open')) !== false; },

    async isOwned(uid, sku){ return (await val(`ent/${uid}/${sku}/s`)) === 'active'; },

    /** One NEW checkout session per RATE_MS per player. */
    async rateLimit(uid){
      const t = now();
      const r = await ref(`rl/${uid}/at`).transaction(cur =>
        (typeof cur === 'number' && t - cur < RATE_MS) ? undefined : t);
      if(r.committed) return { ok: true };
      const last = r.snapshot.val();
      return { ok: false, retryAfter: Math.max(1, Math.ceil((RATE_MS - (t - (+last || 0))) / 1000)) };
    },

    async readOpen(uid, sku){ return val(`rl/${uid}/o/${sku}`); },
    async setOpen(uid, sku, rec){ await ref(`rl/${uid}/o/${sku}`).set(rec); },
    /** Forgets the open session for this SKU, but only if it is still this one. */
    async clearOpen(uid, sku, sid){
      await ref(`rl/${uid}/o/${sku}`).transaction(cur =>
        (cur && cur.id === sid) ? null : keep(cur));
    },

    /**
     * Claims a provider event before acting on it.
     * @returns {Promise<'claimed'|'done'|'busy'>}  done = already handled (a replay);
     *   busy = another delivery is handling it right now.
     */
    async claimEvent(id, type, lm){
      const t = now();
      let outcome = 'claimed';
      const r = await ref(`events/${id}`).transaction(cur => {
        if(cur && cur.st === 'done'){ outcome = 'done'; return; }
        if(cur && cur.st === 'claimed' && t - (+cur.at || 0) < CLAIM_STALE_MS){ outcome = 'busy'; return; }
        outcome = 'claimed';
        return { t: type, st: 'claimed', at: t, lm: !!lm };
      });
      return r.committed ? 'claimed' : outcome;
    },
    async finishEvent(id){ await ref(`events/${id}`).update({ st: 'done', done: now() }); },
    /** After a failure: let the provider's retry claim it again. */
    async releaseEvent(id){ await ref(`events/${id}`).remove(); },

    /**
     * Applies one order event to shop/ent/<uid>/<sku> in a single transaction.
     * @returns {Promise<{node:object|null, before:?string, after:?string, dup:boolean, changed:boolean}>}
     *   node is the committed entitlement node as it now stands.
     */
    async apply({ uid, sku, sid, ev, meta }){
      const t = now();
      let res = { node: null, before: null, after: null, dup: false };
      const r = await ref(`ent/${uid}/${sku}`).transaction(cur => {
        res = applyToNode(cur, sid, ev, t, meta);
        return res.node === null ? keep(cur) : res.node;
      });
      const changed = r.committed && res.node !== null;
      return { node: r.snapshot.val(), before: res.before, after: res.after, dup: changed && res.dup, changed };
    },

    /** The receipt line. An update, so later events add to what earlier ones wrote. */
    async writeOrder(uid, sid, fields){ await ref(`orders/${uid}/${sid}`).update(fields); },

    async indexPI(pi, rec){ if(pi) await ref(`pi/${pi}`).set(rec); },
    async lookupPI(pi){ return pi ? val(`pi/${pi}`) : null; },

    /** The public chip follows the committed pass node, whatever event moved it. */
    async syncBadge(uid){
      const pass = await val(`ent/${uid}/${PASS_SKU}`);
      const on = !!(pass && pass.s === 'active');
      if(on) await ref(`badge/${uid}`).set(+pass.at || now());
      else await ref(`badge/${uid}`).remove();
      return on;
    }
  };
}

module.exports = { makeLedger, keep };
