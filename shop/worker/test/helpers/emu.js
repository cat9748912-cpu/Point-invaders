'use strict';
// The Auth and Database emulators, as `firebase emulators:exec` provides them.
// The database is reached exactly the way the Worker reaches the real one, with
// its own REST client (src/rtdb.js), as an administrator: the emulator accepts
// the fixed token `owner` for that. The project id is a `demo-` one, which the
// emulator suite guarantees never touches a real project.
const { makeRtdb } = require('../../src/rtdb');
const { staticToken } = require('../../src/google');

const PROJECT = process.env.GCLOUD_PROJECT || 'demo-pi-shop';
const AUTH_HOST = process.env.FIREBASE_AUTH_EMULATOR_HOST;
const DB_HOST = process.env.FIREBASE_DATABASE_EMULATOR_HOST;
const HAVE = !!(AUTH_HOST && DB_HOST);
/** For node:test's `skip`: the emulator suites only run under `npm run test:emu`. */
const SKIP = HAVE ? false : 'needs the Auth and Database emulators (npm run test:emu)';

/**
 * The server's database client on its own emulator namespace.
 * @param {string} ns
 * @param {typeof fetch} [f]   a fetch to wrap (to watch or interfere with the requests)
 */
function dbFor(ns, f = fetch){
  const db = makeRtdb({ url: `http://${DB_HOST}`, ns, tokens: staticToken('owner'), fetch: f });
  return { db, ns, clear: () => db.remove('/') };
}

async function idt(path, body){
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/${path}?key=demo-api-key`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body)
  });
  const j = await r.json();
  if(!r.ok) throw new Error(`${path}: ${JSON.stringify(j)}`);
  return j;
}

let mails = 0;
const uniqueEmail = () => `player${Date.now()}${++mails}@example.com`;

/** A guest: signInAnonymously(). */
async function anonUser(){
  const j = await idt('accounts:signUp', { returnSecureToken: true });
  return { uid: j.localId, token: j.idToken };
}
/** A saved account with an email and password (unverified, as this game's are). */
async function passwordUser(email = uniqueEmail(), password = 'secret123'){
  const j = await idt('accounts:signUp', { email, password, returnSecureToken: true });
  return { uid: j.localId, token: j.idToken, email, password };
}
async function signIn(email, password = 'secret123'){
  const j = await idt('accounts:signInWithPassword', { email, password, returnSecureToken: true });
  return { uid: j.localId, token: j.idToken, email };
}
/** What linkWithCredential(EmailAuthProvider…) does on the wire: the guest's own uid gains an email and password. */
async function linkEmail(token, email = uniqueEmail(), password = 'secret123'){
  const j = await idt('accounts:update', { idToken: token, email, password, returnSecureToken: true });
  return { uid: j.localId, token: j.idToken, email, password };
}
/** The Auth emulator's own way to mark an email verified, as Google sign-in accounts are. */
async function verifyEmail(uid){
  const r = await fetch(`http://${AUTH_HOST}/identitytoolkit.googleapis.com/v1/projects/${PROJECT}/accounts:update`, {
    method: 'POST', headers: { 'content-type': 'application/json', authorization: 'Bearer owner' },
    body: JSON.stringify({ localId: uid, emailVerified: true })
  });
  if(!r.ok) throw new Error(`verifyEmail: ${r.status} ${await r.text()}`);
}
function claims(token){ return JSON.parse(Buffer.from(token.split('.')[1], 'base64url').toString('utf8')); }

async function clearAuth(){
  await fetch(`http://${AUTH_HOST}/emulator/v1/projects/${PROJECT}/accounts`, { method: 'DELETE' });
}

const quietLog = () => {
  const lines = [];
  const rec = level => (msg, data) => { lines.push({ level, msg, data }); };
  return { lines, info: rec('info'), warn: rec('warn'), error: rec('error') };
};

module.exports = { PROJECT, HAVE, SKIP, AUTH_HOST, DB_HOST, dbFor, anonUser, passwordUser, signIn, linkEmail,
                   verifyEmail, claims, clearAuth, uniqueEmail, quietLog };
