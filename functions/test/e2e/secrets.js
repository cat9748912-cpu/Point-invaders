'use strict';
// Writes functions/.secret.local for the Functions emulator: the two secrets the
// function declares, with throwaway local values. The file is git-ignored
// (`*.local`), the key is a test-mode placeholder that no provider would accept,
// and the webhook secret is only ever used to sign this suite's own requests.
const fs = require('node:fs');
const path = require('node:path');

const E2E = { STRIPE_SECRET_KEY: 'sk_test_e2e', STRIPE_WEBHOOK_SECRET: 'test-signing-secret-e2e' };

if(require.main === module){
  const file = path.join(__dirname, '..', '..', '.secret.local');
  fs.writeFileSync(file, Object.entries(E2E).map(([k, v]) => `${k}=${v}`).join('\n') + '\n');
  console.log('wrote', path.relative(process.cwd(), file));
}

module.exports = { E2E };
