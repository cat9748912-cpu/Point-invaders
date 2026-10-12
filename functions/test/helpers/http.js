'use strict';
// Just enough of Express's request and response for the handlers.

function mockReq({ method = 'POST', path = '/checkout', headers = {}, body, rawBody } = {}){
  const h = {};
  for(const k of Object.keys(headers)) h[k.toLowerCase()] = headers[k];
  return { method, path, body, rawBody, headers: h, get: name => h[String(name).toLowerCase()] };
}

function mockRes(){
  const r = { statusCode: 200, headers: {}, body: undefined, ended: false, headersSent: false };
  r.status = c => { r.statusCode = c; return r; };
  r.set = (k, v) => { r.headers[String(k).toLowerCase()] = v; return r; };
  r.json = b => { r.body = b; r.ended = true; r.headersSent = true; return r; };
  r.end = () => { r.ended = true; r.headersSent = true; return r; };
  return r;
}

module.exports = { mockReq, mockRes };
