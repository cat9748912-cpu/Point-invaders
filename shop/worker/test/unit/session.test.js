'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildSessionParams } = require('../../src/session');
const catalog = require('../../src/catalog');

const item = catalog.find('col_aurora');
const base = { item, price: { id: 'price_123' }, uid: 'u_abc', email: 'a@example.com', emailVerified: false,
               site: 'https://pointinvaders.com', managed: true, now: 1_800_000_000_000 };

test('the line item is the resolved price, quantity one', () => {
  const p = buildSessionParams(base);
  assert.equal(p.mode, 'payment');
  assert.deepEqual(p.line_items, [{ price: 'price_123', quantity: 1 }]);
});

test('uid and sku travel in client_reference_id, session metadata and payment-intent metadata', () => {
  const p = buildSessionParams(base);
  assert.equal(p.client_reference_id, 'u_abc');
  assert.deepEqual(p.metadata, { uid: 'u_abc', sku: 'col_aurora', v: '1' });
  assert.deepEqual(p.payment_intent_data, { metadata: { uid: 'u_abc', sku: 'col_aurora', v: '1' } });
});

test('return URLs: the site, the sku, and the provider template left unencoded', () => {
  const p = buildSessionParams(base);
  assert.equal(p.success_url, 'https://pointinvaders.com/?purchase=ok&sku=col_aurora&sid={CHECKOUT_SESSION_ID}');
  assert.equal(p.cancel_url, 'https://pointinvaders.com/?purchase=cancel&sku=col_aurora');
});

test('terms are required in both shapes; without Managed Payments our consent text links the policies and states the age rule', () => {
  assert.deepEqual(buildSessionParams(base).consent_collection, { terms_of_service: 'required' });
  const p = buildSessionParams({ ...base, managed: false });
  assert.deepEqual(p.consent_collection, { terms_of_service: 'required' });
  const msg = p.custom_text.terms_of_service_acceptance.message;
  assert.match(msg, /\[Terms\]\(https:\/\/pointinvaders\.com\/legal\/terms\.html\)/);
  assert.match(msg, /\[Refund policy\]\(https:\/\/pointinvaders\.com\/legal\/refunds\.html\)/);
  assert.match(msg, /18 or older, or a parent or guardian/);
  assert.ok(msg.length <= 1200 && p.custom_text.submit.message.length <= 1200, 'provider limit: 1200 characters');
  assert.match(p.custom_text.submit.message, /never becomes Points or Credits/);
});

test('expires 35 minutes out (the provider minimum is 30)', () => {
  const p = buildSessionParams(base);
  assert.equal(p.expires_at, Math.floor(base.now / 1000) + 35 * 60);
});

test('Managed Payments: on, and none of the parameters it refuses', () => {
  const p = buildSessionParams(base);
  assert.deepEqual(p.managed_payments, { enabled: true });
  // custom_text is not on Stripe's list, but the sandbox refused it at Gate 2: "You cannot use custom_text with Managed Payments."
  for(const k of ['adaptive_pricing', 'automatic_tax', 'payment_method_types', 'invoice_creation', 'tax_id_collection',
                  'excluded_payment_method_types', 'payment_method_configuration', 'shipping_address_collection', 'custom_text']){
    assert.ok(!(k in p), `${k} must not be sent with Managed Payments`);
  }
  for(const k of ['statement_descriptor', 'statement_descriptor_suffix', 'receipt_email', 'shipping']){
    assert.ok(!(k in p.payment_intent_data), `payment_intent_data.${k} must not be sent with Managed Payments`);
  }
});

// Non-negotiable 3: the hosted page only. With no ui_mode the provider's default is its own hosted page,
// and the session comes back with a url to redirect to; nothing here could embed a payment form.
test('hosted checkout only: exactly these parameters, and no ui_mode', () => {
  const common = ['cancel_url', 'client_reference_id', 'consent_collection', 'expires_at',
                  'line_items', 'metadata', 'mode', 'payment_intent_data', 'success_url'];
  const keys = a => Object.keys(buildSessionParams(a)).sort();
  assert.deepEqual(keys(base), [...common, 'managed_payments'].sort());
  assert.deepEqual(keys({ ...base, managed: false }), [...common, 'adaptive_pricing', 'custom_text'].sort());
  assert.deepEqual(keys({ ...base, emailVerified: true }), [...common, 'customer_email', 'managed_payments'].sort());
  assert.deepEqual(Object.keys(buildSessionParams(base).payment_intent_data), ['metadata']);
});

test('without Managed Payments: Adaptive Pricing asked for, no managed flag', () => {
  const p = buildSessionParams({ ...base, managed: false });
  assert.deepEqual(p.adaptive_pricing, { enabled: true });
  assert.ok(!('managed_payments' in p));
});

test('the email is pre-filled only when it is verified', () => {
  assert.ok(!('customer_email' in buildSessionParams(base)));
  assert.equal(buildSessionParams({ ...base, emailVerified: true }).customer_email, 'a@example.com');
  assert.ok(!('customer_email' in buildSessionParams({ ...base, email: null, emailVerified: true })));
});

test('a localhost site (test mode) is used as given', () => {
  const p = buildSessionParams({ ...base, site: 'http://localhost:8080' });
  assert.ok(p.success_url.startsWith('http://localhost:8080/?purchase=ok'));
});
