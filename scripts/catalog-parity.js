#!/usr/bin/env node
'use strict';
// ══════════════════════════════════════════════════════════════════════
//  ⚖️ CATALOGUE PARITY — the shelf and the till must agree
// ══════════════════════════════════════════════════════════════════════
// The server's catalogue (functions/src/catalog.js) decides what can be sold
// and what a payment unlocks. The game keeps its own copy (SHOP_SKUS in
// app.js § 46) to draw the shelf. If the two drift, a card could show a price
// the checkout will not charge, or promise an item the payment does not unlock.
//
// The client copy sits in app.js between two marker lines:
//     // @shop-catalogue:begin
//     const SHOP_SKUS = [ … ];
//     // @shop-catalogue:end
// and is read by evaluating ONLY that block, in an empty sandbox.
//
// Compared for every sku: name, kind, shelf, the price label the card shows,
// and the items it unlocks. Exit 0 = they agree; 1 = they differ (each
// difference printed); 2 = the client block is not there (expected until
// Phase 2 adds it; --allow-missing turns that into 0).
//
//   node scripts/catalog-parity.js [--app path/to/app.js] [--allow-missing]
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.join(__dirname, '..');
const catalog = require(path.join(ROOT, 'functions', 'src', 'catalog.js'));

const BEGIN = '// @shop-catalogue:begin', END = '// @shop-catalogue:end';

/** @returns {Array<object>|null} the client's SHOP_SKUS, or null if the markers are absent */
function readClient(source){
  const a = source.indexOf(BEGIN), b = source.indexOf(END);
  if(a < 0 || b < 0 || b < a) return null;
  const block = source.slice(a + BEGIN.length, b);
  const sandbox = Object.create(null);
  const skus = vm.runInNewContext(block + '\n;SHOP_SKUS', sandbox, { timeout: 1000 });
  if(!Array.isArray(skus)) throw new Error('the catalogue block does not define an array SHOP_SKUS');
  return skus;
}

/** Every disagreement between the two lists, as readable lines. Empty = parity. */
function compare(server, client){
  const problems = [];
  const s = new Map(server.map(x => [x.sku, x])), c = new Map(client.map(x => [x.sku, x]));
  for(const sku of s.keys()) if(!c.has(sku)) problems.push(`${sku}: on the server, missing from the client`);
  for(const sku of c.keys()) if(!s.has(sku)) problems.push(`${sku}: on the client, unknown to the server (it could never be bought)`);
  for(const [sku, a] of s){
    const b = c.get(sku);
    if(!b) continue;
    if(a.name !== b.name) problems.push(`${sku}: name "${a.name}" vs "${b.name}"`);
    if(a.kind !== b.kind) problems.push(`${sku}: kind ${a.kind} vs ${b.kind}`);
    if((a.cat || null) !== (b.cat || null)) problems.push(`${sku}: shelf ${a.cat} vs ${b.cat}`);
    const label = catalog.priceLabel(a);
    if(label !== b.price) problems.push(`${sku}: price ${label} vs ${b.price}`);
    const ga = [...a.grants].sort().join(','), gb = [...(b.grants || [])].sort().join(',');
    if(ga !== gb) problems.push(`${sku}: unlocks [${ga}] vs [${gb}]`);
  }
  return problems;
}

function main(argv = process.argv.slice(2), out = console){
  const i = argv.indexOf('--app');
  const appPath = i >= 0 ? argv[i + 1] : path.join(ROOT, 'app.js');
  const client = readClient(fs.readFileSync(appPath, 'utf8'));
  if(!client){
    out.log(`No client catalogue in ${path.relative(process.cwd(), appPath) || appPath} (markers ${BEGIN} … ${END}).`);
    return argv.includes('--allow-missing') ? 0 : 2;
  }
  const problems = compare(catalog.SKUS, client);
  if(problems.length){
    out.error(`Catalogue parity FAILED (${problems.length}):`);
    for(const p of problems) out.error('  · ' + p);
    return 1;
  }
  out.log(`Catalogue parity OK: ${catalog.SKUS.length} SKUs agree (name, kind, shelf, price label, items unlocked).`);
  return 0;
}

if(require.main === module) process.exitCode = main();

module.exports = { readClient, compare, main, BEGIN, END };
