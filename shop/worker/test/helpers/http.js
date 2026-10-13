'use strict';
// Requests built the way the Worker receives them, and its answers read back as
// plain objects ({ statusCode, headers, body }) for the assertions.

const BASE = 'https://point-invaders-shop.example.workers.dev';

/**
 * @param {object} [o]
 * @param {string} [o.method]
 * @param {string} [o.path]
 * @param {Record<string,string>} [o.headers]
 * @param {any} [o.body]             JSON-encoded unless it is already a string
 * @param {Uint8Array|string} [o.raw] exact bytes (the webhook's signed payload)
 */
function request({ method = 'POST', path = '/checkout', headers = {}, body, raw } = {}){
  const init = { method, headers };
  if(method !== 'GET' && method !== 'HEAD'){
    if(raw !== undefined) init.body = raw;
    else if(body !== undefined) init.body = typeof body === 'string' ? body : JSON.stringify(body);
  }
  return new Request(BASE + path, init);
}

/** @param {Response} res */
async function read(res){
  const text = await res.text();
  let body = null;
  try{ body = text ? JSON.parse(text) : null; }catch(e){ body = text; }
  const headers = {};
  res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
  return { statusCode: res.status, headers, body };
}

module.exports = { request, read, BASE };
