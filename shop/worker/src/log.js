'use strict';
// ══════════════════════════════════════════════════════════════════════
//  📜 LOGS — one JSON object per line
// ══════════════════════════════════════════════════════════════════════
// Workers Logs indexes the fields of a JSON line, so every entry is one object:
// { level, msg, …data }. Never pass a token, a key, an email address or a
// request body in `data`: ids, codes and states only.

/** @param {Pick<Console, 'log'|'warn'|'error'>} [sink] */
function makeLog(sink = console){
  const line = (level, out) => (msg, data) => {
    let text;
    try{ text = JSON.stringify({ level, msg, ...(data || {}) }); }catch(e){ text = JSON.stringify({ level, msg }); }
    out.call(sink, text);
  };
  return { info: line('info', sink.log), warn: line('warn', sink.warn), error: line('error', sink.error) };
}

module.exports = { makeLog };
