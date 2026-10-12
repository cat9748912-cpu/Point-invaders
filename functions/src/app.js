'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🧭 THE ROUTER — one function, two doors and a health check
// ══════════════════════════════════════════════════════════════════════
// Built from injected dependencies, so the tests drive exactly the code that
// is deployed, with an emulated database and auth and a fake provider client.
const { makeLedger } = require('./ledger');
const { handleCheckout } = require('./checkout');
const { handleWebhook } = require('./webhook');
const { send, routeOf } = require('./http');

/**
 * @param {object} deps
 * @param {import('firebase-admin/database').Database} deps.db
 * @param {import('firebase-admin/auth').Auth} deps.auth
 * @param {object} deps.stripe   a Stripe client (or a fake with the same surface)
 * @param {{live:boolean, webhookSecret:string, managed:boolean, autoRefundDupes:boolean, site:string}} deps.cfg
 * @param {{info:Function, warn:Function, error:Function}} deps.log
 * @param {() => number} [deps.now]
 */
function createApp(deps){
  const now = deps.now || Date.now;
  const full = { ...deps, now, ledger: deps.ledger || makeLedger(deps.db, now) };
  return async function shop(req, res){
    const route = routeOf(req);
    try{
      if(route === 'checkout') return await handleCheckout(req, res, full);
      if(route === 'webhook') return await handleWebhook(req, res, full);
      if(route === 'health' && req.method === 'GET') return send(res, 200, { ok: true, live: !!full.cfg.live });
      return send(res, 404, { error: 'route' });
    }catch(e){
      // Anything unplanned (the database unreachable, say) is a 500 the caller can
      // retry; the provider retries webhooks on its own.
      full.log.error('shop: unhandled error', { route, error: e && e.message, code: e && e.code });
      if(!res.headersSent) return send(res, 500, { error: 'internal' });
    }
  };
}

module.exports = { createApp };
