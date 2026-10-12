'use strict';
// ══════════════════════════════════════════════════════════════════════
//  ⚙️ CONSTANTS — where the shop lives and how hard it pushes back
// ══════════════════════════════════════════════════════════════════════
// Nothing here is a secret. The provider keys are Functions secrets, read at
// runtime in index.js and never written down anywhere in this repository.

/** The address the arcade is served from, and the default return address. */
const SITE = 'https://pointinvaders.com';

/** Browser origins that may call /checkout. The GitHub Pages address redirects
 *  to SITE, so a page can never really run there, but it is the arcade's other
 *  public name and costs nothing to allow. */
const PROD_ORIGINS = Object.freeze([SITE, 'https://cat9748912-cpu.github.io']);

/** A developer's own machine. Allowed in TEST mode only, and only then does a
 *  checkout return there instead of to SITE. */
const LOCAL_ORIGIN = /^http:\/\/(localhost|127\.0\.0\.1)(:\d{1,5})?$/;

/** The project's Realtime Database. Given explicitly: the instance is regional
 *  (asia-southeast1), and the Admin SDK must not guess a us-central1 URL. */
const DATABASE_URL = 'https://neal-with-roblox-default-rtdb.asia-southeast1.firebasedatabase.app';

/** Beside the database. */
const REGION = 'asia-southeast1';

/** The provider API version: the one stripe@23.0.0 pins. The webhook endpoint
 *  must be created on the same version so its payloads match this code. */
const STRIPE_API_VERSION = '2026-09-30.endive';

/** One NEW checkout session per player per this many ms. */
const RATE_MS = 10_000;
/** An open session is handed back instead of a new one while it has at least this long to live. */
const REUSE_MIN_MS = 120_000;
/** Checkout sessions live 35 minutes: the provider's minimum is 30 after its own clock's creation time. */
const SESSION_TTL_S = 35 * 60;
/** A webhook claim older than this belongs to a worker that died; the next delivery takes it over. */
const CLAIM_STALE_MS = 120_000;

/** Live mode is a property of the key, not a setting that could disagree with it. */
function isLiveKey(key){ return /^(sk|rk)_live_/.test(String(key || '')); }

/** @param {string} origin @param {boolean} live */
function originAllowed(origin, live){
  if(PROD_ORIGINS.includes(origin)) return true;
  return !live && LOCAL_ORIGIN.test(origin);
}

/** Where a checkout returns to. Never anything the caller made up: an allowed
 *  local origin in test mode, otherwise the configured site. */
function returnSite(origin, live, site = SITE){
  if(!live && origin && LOCAL_ORIGIN.test(origin)) return origin;
  return String(site || SITE).replace(/\/+$/, '');
}

module.exports = {
  SITE, PROD_ORIGINS, LOCAL_ORIGIN, DATABASE_URL, REGION, STRIPE_API_VERSION,
  RATE_MS, REUSE_MIN_MS, SESSION_TTL_S, CLAIM_STALE_MS,
  isLiveKey, originAllowed, returnSite
};
