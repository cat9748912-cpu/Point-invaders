// ══════════════════════════════════════════════════════════════════════
//  🔐 POINT INVADERS — THE RESTRICTED SHELF'S SERVER (app.js § 46 · v84)
// ══════════════════════════════════════════════════════════════════════
// A Cloudflare Worker on the free plan:
//   POST /checkout   a signed-in, saved account asks to buy one SKU → { url }
//   POST /webhook    the payment provider reports what happened to a payment
//   GET  /health     { ok, live, db } for the runbook's smoke test
//
// It is the only writer of entitlements (shop/* in the Realtime Database). The
// design, the data model and the reasons are in docs/monetisation/DESIGN.md;
// the deploy steps are in docs/monetisation/RUNBOOK.md.
//
// Secrets (`npx wrangler secret put <NAME>`, never in this repository):
//   STRIPE_SECRET_KEY         a restricted key (rk_test_… / rk_live_…); its prefix
//                             decides test or live mode for everything below
//   STRIPE_WEBHOOK_SECRET     the webhook endpoint's signing secret
//   FIREBASE_SERVICE_ACCOUNT  the JSON key of a service account whose only role is
//                             Firebase Realtime Database Admin
// Settings ([vars] in wrangler.toml): SITE, PROJECT_ID, DATABASE_URL,
// MANAGED_PAYMENTS, AUTO_REFUND_DUPES.
//
// The tests also set FIREBASE_DATABASE_EMULATOR_HOST, FIREBASE_AUTH_EMULATOR_HOST,
// DATABASE_NS and STRIPE_API_BASE. They point the Worker at the emulators and a
// fake provider, and are refused next to a live key.
import { createApp } from './app.js';
import { json } from './http.js';
import { makeStripe } from './stripe.js';
import { makeRtdb } from './rtdb.js';
import { makeTokenSource, staticToken } from './google.js';
import { makeVerifier } from './idtoken.js';
import { makeLog } from './log.js';
import { SITE, PROJECT_ID, DATABASE_URL, isLiveKey } from './config.js';

const log = makeLog();
/** One app per configuration, built on the first request an isolate serves. */
const apps = new WeakMap();

/**
 * @param {Record<string, string|undefined>} env
 * @returns {{app?:(r:Request) => Promise<Response>, problem?:object}}
 */
export function build(env){
  const key = env.STRIPE_SECRET_KEY || '';
  const live = isLiveKey(key);
  const dbEmu = env.FIREBASE_DATABASE_EMULATOR_HOST || '';
  const authEmu = env.FIREBASE_AUTH_EMULATOR_HOST || '';
  const testing = !!(dbEmu || authEmu || env.STRIPE_API_BASE);
  if(testing && live) return { problem: { error: 'config', reason: 'emulator settings next to a live key' } };

  const missing = ['STRIPE_SECRET_KEY', 'STRIPE_WEBHOOK_SECRET'].filter(k => !env[k]);
  if(!dbEmu && !env.FIREBASE_SERVICE_ACCOUNT) missing.push('FIREBASE_SERVICE_ACCOUNT');
  if(missing.length) return { problem: { error: 'config', missing } };

  let tokens;
  try{
    tokens = dbEmu ? staticToken('owner') : makeTokenSource({ serviceAccount: env.FIREBASE_SERVICE_ACCOUNT });
  }catch(e){
    return { problem: { error: 'config', reason: e.message } };
  }
  const projectId = env.PROJECT_ID || PROJECT_ID;
  const db = makeRtdb({
    url: dbEmu ? `http://${dbEmu}` : (env.DATABASE_URL || DATABASE_URL),
    ns: dbEmu ? (env.DATABASE_NS || `${projectId}-default-rtdb`) : null,
    tokens
  });
  const app = createApp({
    db,
    verifier: makeVerifier({ projectId, emulator: !!authEmu }),
    stripe: makeStripe({ key, base: env.STRIPE_API_BASE || undefined }),
    log,
    cfg: {
      live,
      webhookSecret: env.STRIPE_WEBHOOK_SECRET,
      managed: env.MANAGED_PAYMENTS !== 'false',
      autoRefundDupes: env.AUTO_REFUND_DUPES !== 'false',
      site: env.SITE || SITE
    }
  });
  return { app };
}

export default {
  /** @param {Request} request @param {Record<string, string|undefined>} env */
  async fetch(request, env){
    let built = apps.get(env);
    if(!built){ built = build(env); apps.set(env, built); }
    if(built.app) return built.app(request);
    // Not configured yet (a secret not set): say what is missing on /health, and
    // refuse everything else. The game carries on without the shop; the provider
    // retries its webhooks for three days.
    log.error('worker: not configured', built.problem);
    const health = new URL(request.url).pathname.replace(/\/+$/, '').endsWith('/health');
    return json(503, health ? { ok: false, ...built.problem } : { error: 'unconfigured' });
  }
};
