'use strict';
// Service-account access tokens (src/google.js): the signed assertion Google is
// sent, the caching, and refusals. Keys are generated at run time; no key is
// stored in this repository.
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const { makeTokenSource, parseServiceAccount, clearTokenCache, DB_SCOPES, TOKEN_URI } = require('../../src/google');

function serviceAccount(){
  const { privateKey, publicKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  const sa = {
    type: 'service_account', project_id: 'demo-pi-shop', private_key_id: 'kid-unit',
    private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }),
    client_email: `shop-${crypto.randomBytes(4).toString('hex')}@demo-pi-shop.iam.gserviceaccount.com`,
    token_uri: TOKEN_URI
  };
  return { sa, publicKey };
}

/** Google's token endpoint, played back: records each assertion, answers with a token. */
function tokenEndpoint(answer = n => ({ status: 200, body: { access_token: `ya29.fake-${n}`, expires_in: 3599, token_type: 'Bearer' } })){
  const seen = [];
  const f = async (url, init) => {
    seen.push({ url, ...init });
    const a = answer(seen.length);
    return new Response(JSON.stringify(a.body), { status: a.status });
  };
  return { f, seen };
}

const part = (jwt, i) => JSON.parse(Buffer.from(jwt.split('.')[i], 'base64url').toString('utf8'));

test('the assertion: signed with the account key, for the database scopes, an hour long', async () => {
  clearTokenCache();
  const { sa, publicKey } = serviceAccount();
  const g = tokenEndpoint();
  const t0 = 1_800_000_000_000;
  const tokens = makeTokenSource({ serviceAccount: JSON.stringify(sa), fetch: g.f, now: () => t0 });
  assert.equal(await tokens.getToken(), 'ya29.fake-1');
  assert.equal(g.seen.length, 1);
  assert.equal(g.seen[0].url, TOKEN_URI);
  assert.equal(g.seen[0].method, 'POST');
  const form = new URLSearchParams(g.seen[0].body);
  assert.equal(form.get('grant_type'), 'urn:ietf:params:oauth:grant-type:jwt-bearer');
  const jwt = form.get('assertion');
  assert.deepEqual(part(jwt, 0), { alg: 'RS256', typ: 'JWT', kid: 'kid-unit' });
  assert.deepEqual(part(jwt, 1), { iss: sa.client_email, scope: DB_SCOPES.join(' '), aud: TOKEN_URI,
                                   iat: t0 / 1000, exp: t0 / 1000 + 3600 });
  const [h, c, s] = jwt.split('.');
  assert.equal(crypto.verify('sha256', Buffer.from(`${h}.${c}`), publicKey, Buffer.from(s, 'base64url')), true,
    'the signature verifies with the account public key');
});

test('a token is reused until five minutes before it expires, then renewed', async () => {
  clearTokenCache();
  const { sa } = serviceAccount();
  const g = tokenEndpoint();
  let clock = 1_800_000_000_000;
  const tokens = makeTokenSource({ serviceAccount: sa, fetch: g.f, now: () => clock });
  assert.equal(await tokens.getToken(), 'ya29.fake-1');
  clock += 50 * 60 * 1000;
  assert.equal(await tokens.getToken(), 'ya29.fake-1', 'still fresh: no second exchange');
  assert.equal(g.seen.length, 1);
  clock += 6 * 60 * 1000;
  assert.equal(await tokens.getToken(), 'ya29.fake-2');
  assert.equal(g.seen.length, 2);
});

test("refusals: not a key file, or Google says no (its error word, never the assertion)", async () => {
  clearTokenCache();
  assert.throws(() => parseServiceAccount('{"type":"authorized_user"}'), e => e.code === 'google_key');
  assert.throws(() => parseServiceAccount('not json'), e => e.code === 'google_key');
  assert.throws(() => makeTokenSource({ serviceAccount: '{}' }), e => e.code === 'google_key');
  const { sa } = serviceAccount();
  const g = tokenEndpoint(() => ({ status: 400, body: { error: 'invalid_grant', error_description: 'Invalid JWT Signature.' } }));
  const tokens = makeTokenSource({ serviceAccount: sa, fetch: g.f });
  await assert.rejects(tokens.getToken(), e => e.code === 'google_key' && /invalid_grant/.test(e.message) && !/eyJ/.test(e.message));
  const bad = { ...sa, client_email: 'x-' + sa.client_email, private_key: '-----BEGIN NOT A KEY-----\nAAAA\n-----END NOT A KEY-----' };
  await assert.rejects(makeTokenSource({ serviceAccount: bad, fetch: g.f }).getToken(), e => e.code === 'google_key');
});
