'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🧭 THE ROUTER — one Worker, two doors and a health check
// ══════════════════════════════════════════════════════════════════════
// Built from injected dependencies, so the tests drive exactly the code that is
// deployed, with an emulated database and auth and a fake provider client.
const { makeLedger } = require('./ledger');
const { handleCheckout } = require('./checkout');
const { handleWebhook } = require('./webhook');
const { json, routeOf } = require('./http');

/**
 * @param {object} deps
 * @param {ReturnType<import('./rtdb').makeRtdb>} deps.db
 * @param {{verify:(token:string) => Promise<object>}} deps.verifier
 * @param {object} deps.stripe   stripe.js's client (or a fake with the same surface)
 * @param {{live:boolean, webhookSecret:string, managed:boolean, autoRefundDupes:boolean, site:string}} deps.cfg
 * @param {{info:Function, warn:Function, error:Function}} deps.log
 * @param {() => number} [deps.now]
 * @returns {(request:Request) => Promise<Response>}
 */
function createApp(deps){
  const now = deps.now || Date.now;
  const full = { ...deps, now, ledger: deps.ledger || makeLedger(deps.db, now) };
  return async function shop(request){
    const route = routeOf(request);
    try{
      if(route === 'checkout') return await handleCheckout(request, full);
      if(route === 'webhook') return await handleWebhook(request, full);
      if(route === 'health' && request.method === 'GET') return await health(full);
      return json(404, { error: 'route' });
    }catch(e){
      // Anything unplanned (the database unreachable, say) is a 500 the caller can
      // retry; the provider retries webhooks on its own.
      full.log.error('shop: unhandled error', { route, error: e && e.message, code: e && e.code });
      return json(500, { error: 'internal' });
    }
  };
}

/**
 * For the runbook's smoke test: test or live, and whether the database answers
 * this Worker. `db` is ok, `key` (Google refused the service account), `denied`
 * (the account lacks the database role) or `error`.
 */
async function health(full){
  let db = 'ok';
  try{
    await full.ledger.shopOpen();
  }catch(e){
    db = e && e.code === 'google_key' ? 'key' : e && e.code === 'db_denied' ? 'denied' : 'error';
    full.log.error('health: database check failed', { db, error: e && e.message });
  }
  return json(db === 'ok' ? 200 : 503, { ok: db === 'ok', live: !!full.cfg.live, db });
}

module.exports = { createApp };
