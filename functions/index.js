'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🔐 POINT INVADERS — THE RESTRICTED SHELF'S SERVER (app.js § 46 · v84)
// ══════════════════════════════════════════════════════════════════════
// One HTTPS function, `shop`:
//   POST /checkout   a signed-in, saved account asks to buy one SKU → { url }
//   POST /webhook    the payment provider reports what happened to a payment
//   GET  /health     { ok, live } for the runbook's smoke test
//
// It is the only writer of entitlements (shop/* in the Realtime Database). The
// design, the data model and the reasons are in docs/monetisation/DESIGN.md;
// the deploy steps are in docs/monetisation/RUNBOOK.md.
//
// Secrets (set with `firebase functions:secrets:set`, never in this repo):
//   STRIPE_SECRET_KEY      a restricted key (rk_test_… / rk_live_…); its prefix
//                          decides test or live mode for everything below
//   STRIPE_WEBHOOK_SECRET  the signing secret of the webhook endpoint (whsec_…)
const { onRequest } = require('firebase-functions/https');
const { defineSecret, defineBoolean, defineString } = require('firebase-functions/params');
const logger = require('firebase-functions/logger');
const { initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getAuth } = require('firebase-admin/auth');
const Stripe = require('stripe');
const C = require('./src/config');
const { createApp } = require('./src/app');

const STRIPE_SECRET_KEY = defineSecret('STRIPE_SECRET_KEY');
const STRIPE_WEBHOOK_SECRET = defineSecret('STRIPE_WEBHOOK_SECRET');
// Plain parameters with defaults. The first deploy asks for each one with its default
// already filled in, and saves the answers in functions/.env.<project> (git-ignored), so
// later deploys don't ask. Change a value there and redeploy.
const SHOP_MANAGED_PAYMENTS = defineBoolean('SHOP_MANAGED_PAYMENTS', {
  default: true,
  description: 'Stripe Managed Payments (Link as merchant of record, handling VAT/GST). Off = you are the merchant.'
});
const SHOP_AUTO_REFUND_DUPES = defineBoolean('SHOP_AUTO_REFUND_DUPES', {
  default: true,
  description: 'Refund a second payment for an item the player already owns.'
});
const SHOP_SITE = defineString('SHOP_SITE', {
  default: C.SITE,
  description: 'Where a checkout returns to in live mode.'
});

initializeApp({ databaseURL: C.DATABASE_URL });

// Built on the first request: secret values can only be read at run time.
let handler = null;
function getHandler(){
  if(handler) return handler;
  const key = STRIPE_SECRET_KEY.value();
  const stripe = new Stripe(key, {
    apiVersion: C.STRIPE_API_VERSION,
    maxNetworkRetries: 2,
    timeout: 20000,
    appInfo: { name: 'point-invaders-shop' }
  });
  handler = createApp({
    db: getDatabase(),
    auth: getAuth(),
    stripe,
    log: logger,
    now: Date.now,
    cfg: {
      live: C.isLiveKey(key),
      webhookSecret: STRIPE_WEBHOOK_SECRET.value(),
      managed: SHOP_MANAGED_PAYMENTS.value(),
      autoRefundDupes: SHOP_AUTO_REFUND_DUPES.value(),
      site: SHOP_SITE.value()
    }
  });
  return handler;
}

exports.shop = onRequest({
  region: C.REGION,
  invoker: 'public',            // the browser and the provider call it; the token and the signature are the locks
  memory: '256MiB',
  timeoutSeconds: 30,
  maxInstances: 10,
  secrets: [STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET]
}, (req, res) => getHandler()(req, res));
