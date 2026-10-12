'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🔐 THE SERVER CATALOGUE — the one list the money side believes
// ══════════════════════════════════════════════════════════════════════
// Every SKU the Restricted shelf can sell, and nothing else. The checkout
// endpoint refuses any sku that is not here, the webhook ignores a session
// whose metadata names one that is not here, and scripts/seed-products.js
// creates the provider's products and prices FROM this list.
//
// The sku is used in three places, so it never changes once it has been sold:
//   · the provider's price LOOKUP KEY — test and live mode each carry their
//     own price under the same key, so no price id is ever written in code;
//   · the key under shop/ent/<uid>/ that says who owns it;
//   · checkout metadata, which is how a paid session finds its way back here.
//
// The client keeps a copy (SHOP_SKUS in app.js § 46) for drawing the shelf.
// scripts/catalog-parity.js fails if the two disagree on a sku, its kind, its
// shelf, its price label or what it unlocks.
//
// `grants` are client item ids (equipped.<cat> values). They carry an `-x-`
// infix so they can never collide with an item sold for Credits, and stay
// within the 40 characters the players/$uid/equipped/$cat rule allows.
// A `pass` also lights the public ◆ SUPPORTER chip (shop/badge).
// An `exhibition` item unlocks a power-up that only works in an Exhibition
// round, which pays nothing and is on no board (DESIGN § 3.3).

/** Catalogue version, written into checkout metadata as `v`. */
const CATALOG_VERSION = '1';

const PASS_SKU = 'pass_supporter';

/** Video Games — downloaded — non subscription — with permanent rights. An
 *  eligible code for Managed Payments (DESIGN § 8.1); confirm with your tax adviser. */
const TAX_CODE = 'txcd_10201000';

const SKU_RE = /^[a-z0-9_]{3,40}$/;
const GRANT_RE = /^[a-z]+-x-[a-z0-9-]+$/;
const KINDS = new Set(['pass', 'cosmetic', 'exhibition']);
const SHELVES = new Set(['colors', 'cursors', 'skins', 'worlds', 'companions', 'powerups']);

/**
 * @typedef {object} Sku
 * @property {string}   sku        id, price lookup key, entitlement key
 * @property {string}   name       shown on the checkout page and the shelf
 * @property {'pass'|'cosmetic'|'exhibition'} kind
 * @property {?string}  cat        the shelf it also appears on (null for the pass)
 * @property {number}   amount     price in the currency's minor unit (cents), tax included
 * @property {string}   currency   ISO code, lower case
 * @property {string[]} grants     client item ids it unlocks
 * @property {string}   desc       product description (checkout page and receipt)
 * @property {string}   lookupKey  the provider's price lookup key (= sku)
 * @property {string}   taxCode    the provider's product tax code
 */

/** @param {Omit<Sku,'currency'|'lookupKey'|'taxCode'> & Partial<Sku>} s @returns {Sku} */
function def(s){
  return Object.freeze({
    currency: 'usd',
    lookupKey: s.sku,
    taxCode: TAX_CODE,
    ...s,
    grants: Object.freeze([...(s.grants || [])])
  });
}

/** @type {ReadonlyArray<Sku>} */
const SKUS = Object.freeze([
  def({ sku: PASS_SKU,       name: 'Supporter Pass', kind: 'pass',       cat: null,        amount: 499, grants: ['col-x-patron'],
        desc: 'The ◆ SUPPORTER chip beside your name on every board and player card, and the Patron colour. Thank you for keeping the arcade running.' }),
  def({ sku: 'col_aurora',   name: 'Aurora',         kind: 'cosmetic',   cat: 'colors',    amount: 199, grants: ['col-x-aurora'],
        desc: 'An exclusive colour for your whole interface: northern-lights mint.' }),
  def({ sku: 'col_ultra',    name: 'Ultraviolet',    kind: 'cosmetic',   cat: 'colors',    amount: 199, grants: ['col-x-ultra'],
        desc: 'An exclusive colour for your whole interface: deep blue-violet.' }),
  def({ sku: 'cur_comet',    name: 'Comet',          kind: 'cosmetic',   cat: 'cursors',   amount: 199, grants: ['cur-x-comet'],
        desc: 'An exclusive animated cursor that streaks after your pointer.' }),
  def({ sku: 'skin_kitsune', name: 'Neon Kitsune',   kind: 'cosmetic',   cat: 'skins',     amount: 299, grants: ['skin-x-kitsune'],
        desc: 'An exclusive player skin.' }),
  def({ sku: 'skin_unicorn', name: 'Glitch Unicorn', kind: 'cosmetic',   cat: 'skins',     amount: 299, grants: ['skin-x-unicorn'],
        desc: 'An exclusive player skin.' }),
  def({ sku: 'wld_polar',    name: 'Polar Night',    kind: 'cosmetic',   cat: 'worlds',    amount: 399, grants: ['wld-x-polar'],
        desc: 'An exclusive world theme: an aurora sky over every 3D mission and open world.' }),
  def({ sku: 'pu_aegis',     name: 'Aegis Field',    kind: 'exhibition', cat: 'powerups',  amount: 299, grants: [],
        desc: 'Exhibition power-up: in an Exhibition round every fatal hit is absorbed. Exhibition rounds pay nothing and appear on no board.' }),
  def({ sku: 'pu_anchor',    name: 'Chrono Anchor',  kind: 'exhibition', cat: 'powerups',  amount: 299, grants: [],
        desc: 'Exhibition power-up: in an Exhibition round, +10 seconds on the clock per press. Exhibition rounds pay nothing and appear on no board.' })
]);

/** @type {Readonly<Record<string, Sku>>} */
const BY_SKU = Object.freeze(Object.fromEntries(SKUS.map(s => [s.sku, s])));

/** The price label the shelf shows, e.g. `$4.99`. Only USD is sold as a base price;
 *  Adaptive Pricing shows each buyer their own currency at checkout. */
function priceLabel(s){
  if(s.currency !== 'usd') throw new Error('priceLabel: only usd base prices are supported');
  return '$' + (s.amount / 100).toFixed(2);
}

/** @param {unknown} sku @returns {Sku|null} */
function find(sku){
  return (typeof sku === 'string' && Object.prototype.hasOwnProperty.call(BY_SKU, sku)) ? BY_SKU[sku] : null;
}

/** Throws on the first problem. Run by the tests and by the seeding script before it touches anything. */
function validate(list = SKUS){
  const seen = new Set(), granted = new Set();
  for(const s of list){
    if(!SKU_RE.test(s.sku)) throw new Error(`bad sku id: ${s.sku}`);
    if(seen.has(s.sku)) throw new Error(`duplicate sku: ${s.sku}`);
    seen.add(s.sku);
    if(!KINDS.has(s.kind)) throw new Error(`bad kind for ${s.sku}: ${s.kind}`);
    if(s.kind === 'pass' ? s.cat !== null : !SHELVES.has(s.cat)) throw new Error(`bad shelf for ${s.sku}: ${s.cat}`);
    if(!Number.isInteger(s.amount) || s.amount < 50 || s.amount > 100000) throw new Error(`bad amount for ${s.sku}: ${s.amount}`);
    if(s.lookupKey !== s.sku) throw new Error(`lookup key must equal the sku: ${s.sku}`);
    if(!s.name || s.name.length > 60 || !s.desc) throw new Error(`name/desc missing for ${s.sku}`);
    if(s.kind === 'exhibition' && s.grants.length) throw new Error(`an exhibition sku grants no item: ${s.sku}`);
    if(s.kind !== 'exhibition' && !s.grants.length) throw new Error(`${s.sku} grants nothing`);
    for(const g of s.grants){
      if(!GRANT_RE.test(g) || g.length > 40) throw new Error(`bad grant id for ${s.sku}: ${g}`);
      if(granted.has(g)) throw new Error(`item granted by two skus: ${g}`);
      granted.add(g);
    }
  }
  if(!list.some(s => s.sku === PASS_SKU && s.kind === 'pass')) throw new Error('the supporter pass is missing');
  return true;
}

module.exports = { CATALOG_VERSION, PASS_SKU, TAX_CODE, SKUS, BY_SKU, find, priceLabel, validate };
