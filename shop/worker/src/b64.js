'use strict';
// ══════════════════════════════════════════════════════════════════════
//  🔤 BYTES — base64url, UTF-8 and hex without Node's Buffer
// ══════════════════════════════════════════════════════════════════════
// The Workers runtime has atob/btoa and TextEncoder but no Buffer, so the few
// conversions the tokens and signatures need are spelled out once, here.

const enc = new TextEncoder();
const dec = new TextDecoder();

/** @param {string} s */
const utf8 = s => enc.encode(s);
/** @param {Uint8Array|ArrayBuffer} b */
const fromUtf8 = b => dec.decode(b);

function b64ToBytes(s){
  const bin = atob(s);
  const out = new Uint8Array(bin.length);
  for(let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

function bytesToB64(bytes){
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let bin = '';
  for(let i = 0; i < b.length; i++) bin += String.fromCharCode(b[i]);
  return btoa(bin);
}

function b64urlToBytes(s){
  let t = String(s).replace(/-/g, '+').replace(/_/g, '/');
  while(t.length % 4) t += '=';
  return b64ToBytes(t);
}

const bytesToB64url = b => bytesToB64(b).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
const jsonToB64url = o => bytesToB64url(utf8(JSON.stringify(o)));
const b64urlToJson = s => JSON.parse(fromUtf8(b64urlToBytes(s)));

function toHex(buf){
  const b = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for(let i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, '0');
  return s;
}

/** @param {...Uint8Array} parts */
function concat(...parts){
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for(const p of parts){ out.set(p, at); at += p.length; }
  return out;
}

module.exports = { utf8, fromUtf8, b64ToBytes, bytesToB64, b64urlToBytes, bytesToB64url, jsonToB64url, b64urlToJson, toHex, concat };
