'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🧾 THE CHECKOUT SESSION — exactly what the provider is asked for
// ══════════════════════════════════════════════════════════════════════
// One pure function, so the tests can assert every parameter without a network.
//
// Two shapes. With Managed Payments (Stripe, through Link, is the merchant of
// record and handles VAT/GST), the provider REFUSES `adaptive_pricing` (it is
// always on), `automatic_tax`, `payment_method_types`, `invoice_creation`, the
// statement descriptors and `receipt_email`, so none of them is ever sent.
// Without it, Adaptive Pricing is asked for explicitly.
//
// What the buyer cannot change: the price (resolved by lookup key on the
// server), the uid (from their verified token) and the metadata. The metadata
// is how a paid session finds its way back to shop/ent/<uid>/<sku>; it is
// also written onto the PaymentIntent, so a refund or a dispute can be traced
// even before the completion has been processed.
const { CATALOG_VERSION } = require('./catalog');
const { SESSION_TTL_S } = require('./config');

/**
 * @param {object} a
 * @param {import('./catalog').Sku} a.item
 * @param {{id:string}} a.price          the provider's active price for item.lookupKey
 * @param {string} a.uid                 from the verified ID token
 * @param {?string} a.email              from the token
 * @param {boolean} a.emailVerified      from the token
 * @param {string} a.site                where to come back to (config.returnSite)
 * @param {boolean} a.managed            Managed Payments on?
 * @param {number} a.now                 ms
 */
function buildSessionParams({ item, price, uid, email, emailVerified, site, managed, now }){
  const meta = { uid, sku: item.sku, v: CATALOG_VERSION };
  const sku = encodeURIComponent(item.sku);
  const p = {
    mode: 'payment',
    line_items: [{ price: price.id, quantity: 1 }],
    client_reference_id: uid,
    metadata: { ...meta },
    payment_intent_data: { metadata: { ...meta } },
    // {CHECKOUT_SESSION_ID} is the provider's own template and must reach it unencoded.
    success_url: `${site}/?purchase=ok&sku=${sku}&sid={CHECKOUT_SESSION_ID}`,
    cancel_url: `${site}/?purchase=cancel&sku=${sku}`,
    consent_collection: { terms_of_service: 'required' },
    custom_text: {
      terms_of_service_acceptance: {
        message: `I agree to the [Terms](${site}/legal/terms.html) and the [Refund policy](${site}/legal/refunds.html). ` +
                 `I am 18 or older, or a parent or guardian has agreed to this purchase.`
      },
      submit: {
        message: `Unlocks ${item.name} on your Point Invaders account straight away. ` +
                 `A one-time purchase: it never becomes Points or Credits.`
      }
    },
    expires_at: Math.floor(now / 1000) + SESSION_TTL_S
  };
  // Pre-filled emails are read-only on the checkout page. Only a VERIFIED address is
  // safe to lock in: this game does not verify email/password sign-ups, and a typo
  // would send the receipt to a stranger with no way to correct it.
  if(email && emailVerified) p.customer_email = email;
  if(managed) p.managed_payments = { enabled: true };
  else p.adaptive_pricing = { enabled: true };
  return p;
}

module.exports = { buildSessionParams };
