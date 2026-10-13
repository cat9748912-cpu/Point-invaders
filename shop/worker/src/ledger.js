'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🗄️ THE LEDGER — every database read and write the shop makes
// ══════════════════════════════════════════════════════════════════════
// All of it under the top-level node `shop`, all of it with an administrator's
// token (rtdb.js), which the security rules do not apply to. Clients may READ
// shop/ent/<own uid>, shop/orders/<own uid>, shop/badge and shop/cfg, and may
// write nothing here at all (database.rules.json).
//
//   shop/cfg                 { open }                       the kill switch; missing = open
//   shop/badge/<uid>         <ms supporter since>           public: the ◆ chip
//   shop/ent/<uid>/<sku>     { s, at, u, o, p, c, lm, ord, dups }
//   shop/orders/<uid>/<sid>  { sku, s, u, amount, currency, pi, at, lm, d, r }
//   shop/events/<eventId>    { t, st, at, lm, done }        webhook idempotency
//   shop/pi/<paymentIntent>  { uid, sku, sid }              charge / dispute → order
//   shop/rl/<uid>            { at, o: { <sku>: { id, exp } } }   rate limit, open sessions
//
// Every read-modify-write is a compare-and-swap transaction (rtdb.js), so two
// deliveries for the same player and item can't interleave.
const { applyToNode } = require('./orders');
const { PASS_SKU } = require('./catalog');
const { RATE_MS, CLAIM_STALE_MS } = require('./config');

/**
 * @param {ReturnType<import('./rtdb').makeRtdb>} db
 * @param {() => number} [now]
 */
function makeLedger(db, now = Date.now){
  const at = p => 'shop/' + p;

  return {
    /** The Console kill switch. Anything but an explicit false is open. */
    async shopOpen(){ return (await db.get(at('cfg/open'))) !== false; },

    async isOwned(uid, sku){ return (await db.get(at(`ent/${uid}/${sku}/s`))) === 'active'; },

    /** One NEW checkout session per RATE_MS per player. */
    async rateLimit(uid){
      const t = now();
      const r = await db.transaction(at(`rl/${uid}/at`), cur =>
        (typeof cur === 'number' && t - cur < RATE_MS) ? undefined : t);
      if(r.committed) return { ok: true };
      return { ok: false, retryAfter: Math.max(1, Math.ceil((RATE_MS - (t - (+r.value || 0))) / 1000)) };
    },

    async readOpen(uid, sku){ return db.get(at(`rl/${uid}/o/${sku}`)); },
    async setOpen(uid, sku, rec){ await db.set(at(`rl/${uid}/o/${sku}`), rec); },
    /** Forgets the open session for this SKU, but only if it is still this one. */
    async clearOpen(uid, sku, sid){
      await db.transaction(at(`rl/${uid}/o/${sku}`), cur => (cur && cur.id === sid) ? null : undefined);
    },

    /**
     * Claims a provider event before acting on it.
     * @returns {Promise<'claimed'|'done'|'busy'>}  done = already handled (a replay);
     *   busy = another delivery is handling it right now.
     */
    async claimEvent(id, type, lm){
      const t = now();
      let outcome = 'claimed';
      const r = await db.transaction(at(`events/${id}`), cur => {
        if(cur && cur.st === 'done'){ outcome = 'done'; return undefined; }
        if(cur && cur.st === 'claimed' && t - (+cur.at || 0) < CLAIM_STALE_MS){ outcome = 'busy'; return undefined; }
        outcome = 'claimed';
        return { t: type, st: 'claimed', at: t, lm: !!lm };
      });
      return r.committed ? 'claimed' : outcome;
    },
    async finishEvent(id){ await db.update(at(`events/${id}`), { st: 'done', done: now() }); },
    /** After a failure: let the provider's retry claim it again. */
    async releaseEvent(id){ await db.remove(at(`events/${id}`)); },

    /**
     * Applies one order event to shop/ent/<uid>/<sku> in a single transaction.
     * @returns {Promise<{node:object|null, before:?string, after:?string, dup:boolean, changed:boolean}>}
     *   node is the entitlement node as the server now holds it.
     */
    async apply({ uid, sku, sid, ev, meta }){
      const t = now();
      let res = { node: null, before: null, after: null, dup: false };
      const r = await db.transaction(at(`ent/${uid}/${sku}`), cur => {
        res = applyToNode(cur, sid, ev, t, meta);
        return res.node === null ? undefined : res.node;
      });
      return { node: r.value, before: res.before, after: res.after, dup: r.committed && res.dup, changed: r.committed };
    },

    /** The receipt line. An update, so later events add to what earlier ones wrote. */
    async writeOrder(uid, sid, fields){ await db.update(at(`orders/${uid}/${sid}`), fields); },

    async indexPI(pi, rec){ if(pi) await db.set(at(`pi/${pi}`), rec); },
    async lookupPI(pi){ return pi ? db.get(at(`pi/${pi}`)) : null; },

    /** The public chip follows the committed pass node, whatever event moved it. */
    async syncBadge(uid){
      const pass = await db.get(at(`ent/${uid}/${PASS_SKU}`));
      const on = !!(pass && pass.s === 'active');
      if(on) await db.set(at(`badge/${uid}`), +pass.at || now());
      else await db.remove(at(`badge/${uid}`));
      return on;
    }
  };
}

module.exports = { makeLedger };
