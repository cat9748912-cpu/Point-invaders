'use strict';
// Firebase ID token verification (src/idtoken.js) against a key pair generated
// here and published through a stand-in for Google's JWK endpoint: every claim
// the Firebase docs require, the signature, key rotation and caching.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeVerifier, clearKeyCache, JWKS_URL } = require('../../src/idtoken');

const PROJECT = 'demo-pi-shop';
const T = 1_800_000_000;                       // "now", in seconds
const now = () => T * 1000;

function keyPair(kid){
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return { kid, privateKey, jwk: { ...publicKey.export({ format: 'jwk' }), kid, alg: 'RS256', use: 'sig' } };
}
const K1 = keyPair('kid-1'), K2 = keyPair('kid-2');

/** Google's JWK endpoint, played back with whatever keys are "published" right now. */
function jwks(published = [K1]){
  const seen = [];
  const f = async url => {
    seen.push(url);
    return new Response(JSON.stringify({ keys: published.map(k => k.jwk) }),
                        { status: 200, headers: { 'cache-control': 'public, max-age=3600, must-revalidate' } });
  };
  return { f, seen, publish: ks => { published = ks; } };
}

const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
function token(claims = {}, { key = K1, head = {} } = {}){
  const h = b64({ alg: 'RS256', kid: key.kid, typ: 'JWT', ...head });
  const c = b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, auth_time: T - 100, user_id: 'uid_1',
                  sub: 'uid_1', iat: T - 100, exp: T + 3500, email: 'p@example.com', email_verified: false,
                  firebase: { identities: {}, sign_in_provider: 'password' }, ...claims });
  const s = crypto.sign('sha256', Buffer.from(`${h}.${c}`), key.privateKey).toString('base64url');
  return `${h}.${c}.${s}`;
}
const refused = (code) => e => e && e.code === code;

test('a genuine token: its claims come back, with the uid', async () => {
  clearKeyCache();
  const g = jwks();
  const v = makeVerifier({ projectId: PROJECT, fetch: g.f, now });
  const c = await v.verify(token());
  assert.equal(c.uid, 'uid_1');
  assert.equal(c.firebase.sign_in_provider, 'password');
  assert.deepEqual(g.seen, [JWKS_URL]);
});

test('every claim the Firebase docs require is checked', async () => {
  clearKeyCache();
  const v = makeVerifier({ projectId: PROJECT, fetch: jwks().f, now });
  await assert.rejects(v.verify(token({ aud: 'another-project' })), refused('aud'));
  await assert.rejects(v.verify(token({ iss: 'https://securetoken.google.com/another-project' })), refused('iss'));
  await assert.rejects(v.verify(token({ exp: T - 1 })), refused('expired'));
  await assert.rejects(v.verify(token({ iat: T + 3600 })), refused('iat'));
  await assert.rejects(v.verify(token({ auth_time: T + 3600 })), refused('auth_time'));
  await assert.rejects(v.verify(token({ sub: '' })), refused('sub'));
  await assert.rejects(v.verify(token({ sub: 'a/b' })), refused('sub'), 'a uid that would change a database path');
  await assert.rejects(v.verify(token({ sub: 'x'.repeat(129) })), refused('sub'));
  assert.equal((await v.verify(token({ iat: T + 30, auth_time: T + 30 }))).uid, 'uid_1', 'a little clock skew is tolerated');
});

test('the signature: a changed claim, another key, alg "none", a missing kid', async () => {
  clearKeyCache();
  const v = makeVerifier({ projectId: PROJECT, fetch: jwks().f, now });
  const [h, , s] = token().split('.');
  const forged = `${h}.${b64({ iss: `https://securetoken.google.com/${PROJECT}`, aud: PROJECT, sub: 'someone_else',
                                 auth_time: T - 1, iat: T - 1, exp: T + 100 })}.${s}`;
  await assert.rejects(v.verify(forged), refused('signature'));
  await assert.rejects(v.verify(token({}, { key: { ...K2, kid: 'kid-1' } })), refused('signature'), 'signed by a key that is not Google\'s');
  const none = `${b64({ alg: 'none', typ: 'JWT' })}.${token().split('.')[1]}.`;
  await assert.rejects(v.verify(none), refused('alg'));
  await assert.rejects(v.verify(token({}, { head: { kid: undefined } })), refused('alg'));
  await assert.rejects(v.verify(token({}, { head: { alg: 'HS256' } })), refused('alg'));
  await assert.rejects(v.verify('not.a.token'), refused('malformed'));
  await assert.rejects(v.verify(''), refused('malformed'));
});

test('keys: cached for the max-age, refetched when Google rotates (at most once a minute)', async () => {
  clearKeyCache();
  const g = jwks([K1]);
  let clock = now();
  const v = makeVerifier({ projectId: PROJECT, fetch: g.f, now: () => clock });
  await v.verify(token());
  await v.verify(token());
  assert.equal(g.seen.length, 1, 'one fetch for both');
  // Google starts signing with a new key: the unknown kid triggers one refetch.
  g.publish([K1, K2]);
  await assert.rejects(v.verify(token({}, { key: K2 })), refused('kid'), 'inside the minute: no refetch yet');
  clock += 61_000;
  assert.equal((await v.verify(token({ iat: T, auth_time: T, exp: T + 3600 }, { key: K2 }))).uid, 'uid_1');
  assert.equal(g.seen.length, 2);
  clock += 3600 * 1000;
  await assert.rejects(v.verify(token({}, { key: K2 })), refused('expired'));
  assert.equal(g.seen.length, 3, 'the cache expired with its max-age, so the keys were fetched again first');
});

test("emulator mode takes only the Auth emulator's unsigned tokens, and still checks the claims", async () => {
  clearKeyCache();
  const v = makeVerifier({ projectId: PROJECT, fetch: async () => { throw new Error('no key fetch in emulator mode'); }, now, emulator: true });
  const claims = token().split('.')[1];
  const unsigned = `${b64({ alg: 'none', typ: 'JWT' })}.${claims}.`;
  assert.equal((await v.verify(unsigned)).uid, 'uid_1');
  await assert.rejects(v.verify(token()), refused('alg'), 'a signed token is not what the emulator issues');
  await assert.rejects(v.verify(`${b64({ alg: 'none' })}.${b64({ aud: 'x' })}.`), refused('aud'));
});
