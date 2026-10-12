'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🛒 POST /checkout — a verified player, a known SKU, a hosted page
// ══════════════════════════════════════════════════════════════════════
// The browser sends `{ sku }` and its Firebase ID token, nothing else. The uid
// comes from the verified token and the price from the provider, by lookup key.
// The answer is `{ url }`, which the game opens with location.assign(): card
// details are only ever typed on the provider's page, never on ours.
//
// In order, each refusal before anything that costs money or a session:
//   CORS · method · kill switch · token · not a guest · known SKU · not owned ·
//   an open session to hand back · rate limit · price · new session.
const catalog = require('./catalog');
const { send, applyCors } = require('./http');
const { buildSessionParams } = require('./session');
const { REUSE_MIN_MS, returnSite } = require('./config');

/**
 * @param {import('express').Request & {rawBody?:Buffer}} req
 * @param {import('express').Response} res
 * @param {object} deps  { auth, stripe, ledger, cfg:{live, managed, site}, log, now }
 */
async function handleCheckout(req, res, deps){
  const { auth, stripe, ledger, cfg, log, now } = deps;

  const cors = applyCors(req, res, cfg.live);
  if(!cors.ok) return send(res, 403, { error: 'origin' });
  if(req.method === 'OPTIONS') return res.status(204).end();
  if(req.method !== 'POST') return send(res, 405, { error: 'method' });

  if(!(await ledger.shopOpen())) return send(res, 503, { error: 'closed' });

  // ── Who is asking ──
  const m = /^Bearer\s+(\S+)$/i.exec(req.get('authorization') || '');
  if(!m) return send(res, 401, { error: 'auth' });
  let tok;
  try{
    // checkRevoked: a disabled or signed-out-everywhere account cannot buy.
    tok = await auth.verifyIdToken(m[1], true);
  }catch(e){
    log.info('checkout: token refused', { code: e && e.code });
    return send(res, 401, { error: 'auth' });
  }
  // A guest's record is deleted when their connection ends (§ 33 of app.js), so a
  // guest must save their account (same uid) before anything can be sold to it.
  const provider = tok.firebase && tok.firebase.sign_in_provider;
  if(!provider || provider === 'anonymous') return send(res, 403, { error: 'guest' });
  const uid = tok.uid;

  // ── What they want ──
  const body = (req.body && typeof req.body === 'object') ? req.body : {};
  const item = catalog.find(body.sku);
  if(!item) return send(res, 400, { error: 'bad_sku' });

  if(await ledger.isOwned(uid, item.sku)) return send(res, 409, { error: 'owned' });

  // ── A session already open for this SKU is handed back, not duplicated ──
  // Two tabs, a double tap, or a lost response all land here instead of
  // producing a second session the player could pay as well.
  const open = await ledger.readOpen(uid, item.sku);
  if(open && open.id && (+open.exp || 0) * 1000 > now() + REUSE_MIN_MS){
    try{
      const s = await stripe.checkout.sessions.retrieve(open.id);
      if(s && s.status === 'open' && s.url) return send(res, 200, { url: s.url, id: s.id, reused: true });
      // Paid, and the webhook has not landed yet: selling it again would charge twice.
      if(s && s.status === 'complete' && s.payment_status === 'paid') return send(res, 409, { error: 'owned_pending' });
    }catch(e){
      log.warn('checkout: open session unreadable, starting a new one', { sid: open.id, code: e && e.code });
    }
  }

  const rl = await ledger.rateLimit(uid);
  if(!rl.ok){
    res.set('Retry-After', String(rl.retryAfter));
    return send(res, 429, { error: 'slow', retryAfter: rl.retryAfter });
  }

  let price;
  try{
    const list = await stripe.prices.list({ lookup_keys: [item.lookupKey], active: true, limit: 1 });
    price = list && list.data && list.data[0];
  }catch(e){
    log.error('checkout: price lookup failed', { sku: item.sku, code: e && e.code });
    return send(res, 502, { error: 'provider' });
  }
  if(!price){
    // The products were not seeded in this mode (scripts/seed-products.js).
    log.error('checkout: no active price for lookup key', { sku: item.sku, live: cfg.live });
    return send(res, 503, { error: 'unpriced' });
  }

  const params = buildSessionParams({
    item, price, uid,
    email: tok.email || null,
    emailVerified: tok.email_verified === true,
    site: returnSite(cors.origin, cfg.live, cfg.site),
    managed: !!cfg.managed,
    now: now()
  });
  let session;
  try{
    session = await stripe.checkout.sessions.create(params);
  }catch(e){
    log.error('checkout: session refused by provider', { sku: item.sku, code: e && e.code, type: e && e.type, param: e && e.param });
    return send(res, 502, { error: 'provider' });
  }
  await ledger.setOpen(uid, item.sku, { id: session.id, exp: session.expires_at || params.expires_at });
  log.info('checkout: session created', { uid, sku: item.sku, sid: session.id, reused: false });
  return send(res, 200, { url: session.url, id: session.id });
}

module.exports = { handleCheckout };
