'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🌐 HTTP — answers, CORS and the two routes
// ══════════════════════════════════════════════════════════════════════
const { originAllowed } = require('./config');

/** Every answer is JSON and never cached: a checkout URL or an error must not be replayed. */
function send(res, status, body){
  res.set('Cache-Control', 'no-store');
  return res.status(status).json(body);
}

/**
 * CORS for /checkout. The allow-list is the real control, not the
 * Authorization header alone: a disallowed browser origin gets 403 before
 * anything else is looked at. A request with no Origin header (curl, a server)
 * is not a browser and is judged on its token like any other.
 * @returns {{ok:boolean, origin:?string}}
 */
function applyCors(req, res, live){
  res.set('Vary', 'Origin');
  const origin = req.get('origin') || null;
  if(!origin) return { ok: true, origin: null };
  if(!originAllowed(origin, live)) return { ok: false, origin };
  res.set('Access-Control-Allow-Origin', origin);
  res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Authorization, Content-Type');
  res.set('Access-Control-Max-Age', '600');
  return { ok: true, origin };
}

/** The last path segment: `/checkout`, `/shop/checkout` and `/shop/checkout/` all
 *  name the same route, whichever URL form (cloudfunctions.net, run.app, the
 *  emulator) the request came in on. */
function routeOf(req){
  const seg = String(req.path || '').split('/').filter(Boolean);
  return seg.length ? seg[seg.length - 1] : '';
}

module.exports = { send, applyCors, routeOf };
