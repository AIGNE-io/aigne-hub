#!/usr/bin/env node
/**
 * Re-encrypt AiCredentials from a source Blocklet Server SQLite DB so that
 * the ciphertext is consumable by the Cloudflare Hub worker.
 *
 * WHY THIS EXISTS
 *
 *   The Blocklet Server ("BS") and Cloudflare ("CF") branches of aigne-hub
 *   use completely different credential-encryption schemes that are NOT
 *   interoperable. A raw copy of the `AiCredentials.credentialValue` column
 *   from `aikit.db` into the CF D1 `AiCredentials` table will produce rows
 *   that the CF worker cannot decrypt — the admin will see "密钥不对" /
 *   "decrypt failed" on every provider call.
 *
 *   Two things must be true for this script to succeed:
 *
 *     1. You have the HISTORICAL BLOCKLET_APP_EK — the same value that was
 *        present in the source BS instance at the time the credentials
 *        were originally written. A freshly generated EK (e.g. the one in
 *        a brand-new CF instance) will NOT decrypt historical data, even
 *        if it "looks like the same BLOCKLET_DID".
 *
 *     2. You have the BLOCKLET_DID that was used as PBKDF2 salt. This is
 *        the APP instance DID (== BLOCKLET_APP_PID in most deployments) —
 *        NOT the component DID. For ai-kit on a BS instance registered as
 *        `zNKWm5HBg...`, the salt is `zNKWm5HBg...`, not the ai-kit
 *        component DID `z8ia3xzq2...`.
 *
 * HOW TO RETRIEVE THE HISTORICAL EK
 *
 *   SSH into the source Blocklet Server host and read the docker-env file
 *   for the target app instance:
 *
 *     sudo cat /data/.blocklet-server/tmp/docker/<APP_PID>/ai-kit/docker-env-blocklet-*-ai-kit
 *
 *   The relevant keys are:
 *
 *     BLOCKLET_DID=<APP_PID>
 *     BLOCKLET_APP_EK=0x...
 *
 *   Note that a single host can run multiple BS instances; make sure you
 *   read from the directory whose name matches the APP_PID that owns the
 *   aikit.db you downloaded.
 *
 * WHAT THIS SCRIPT DOES
 *
 *   For each row in `AiCredentials`:
 *     1. Decrypt the old `api_key` / `secret_access_key` fields using
 *        BS scheme:
 *            passphrase = PBKDF2(HISTORICAL_EK, HISTORICAL_DID, 256, 32, sha512).hex()
 *            plaintext  = CryptoJS AES-256-CBC decrypt (OpenSSL salted)
 *        (other fields like `access_key_id` are already plaintext in BS —
 *        they are passed through unchanged)
 *     2. Re-encrypt the ENTIRE credentialValue object using CF scheme:
 *            key        = PBKDF2(CF_SECRET, "aigne-hub-credentials", 100000, 32, sha256)
 *            ciphertext = AES-256-GCM with 12B IV, output = base64(iv || ct || tag)
 *     3. Emit an `UPDATE` SQL statement wrapping the re-encrypted blob as a
 *        JSON string literal (Drizzle `text({mode: 'json'})` stores a base64
 *        string as `"<base64>"`).
 *
 *   The script ONLY emits SQL to stdout. It does NOT talk to D1. Pipe the
 *   output to wrangler or the CF API yourself so you have a chance to review.
 *
 * USAGE
 *
 *   export HISTORICAL_EK=0x<128 hex>               # from docker-env file
 *   export HISTORICAL_DID=<APP_PID>                # same as BLOCKLET_DID
 *   export CREDENTIAL_ENCRYPTION_KEY=<CF secret>   # what the CF worker uses
 *   export SRC_DB=./migration-backups/source/aikit.db
 *
 *   node docs/migration/scripts/reencrypt-credentials.mjs > /tmp/reencrypt.sql
 *
 *   # review /tmp/reencrypt.sql, then apply via whichever path is reliable:
 *   #   (a) CF API /d1/database/<id>/query per statement (preferred for
 *   #       large writes — wrangler d1 execute has been unreliable for
 *   #       batch data migrations, see pitfall #3 in README.md)
 *   #   (b) wrangler d1 execute --remote --file=/tmp/reencrypt.sql
 *
 * VERIFICATION
 *
 *   Before applying, round-trip one row locally:
 *
 *     node -e '
 *       const crypto = require("node:crypto");
 *       const key = crypto.pbkdf2Sync(
 *         Buffer.from(process.env.CREDENTIAL_ENCRYPTION_KEY, "utf8"),
 *         Buffer.from("aigne-hub-credentials", "utf8"),
 *         100000, 32, "sha256",
 *       );
 *       const buf = Buffer.from(process.argv[1], "base64");
 *       const iv = buf.subarray(0, 12);
 *       const tag = buf.subarray(buf.length - 16);
 *       const ct = buf.subarray(12, buf.length - 16);
 *       const d = crypto.createDecipheriv("aes-256-gcm", key, iv);
 *       d.setAuthTag(tag);
 *       console.log(Buffer.concat([d.update(ct), d.final()]).toString("utf8"));
 *     ' "<base64-blob-from-sql>"
 *
 *   You should see the plaintext JSON (e.g. {"api_key":"sk-..."}).
 *
 * SECURITY
 *
 *   This script deals with plaintext API keys in memory. The generated SQL
 *   file contains re-encrypted blobs (safe) but producing it requires reading
 *   plaintext. Do NOT commit /tmp/reencrypt.sql or the decrypted intermediate
 *   output. Treat the HISTORICAL_EK and CREDENTIAL_ENCRYPTION_KEY as long-lived
 *   secrets — never paste into chat, issue trackers, or logs.
 */

import crypto from 'node:crypto';
import { execSync } from 'node:child_process';
import { createRequire } from 'node:module';

// crypto-js is a transitive dep of @blocklet/sdk; find it wherever it lives.
// Pass CRYPTO_JS_REQUIRE_BASE if you need to override the lookup root.
const require = createRequire(process.env.CRYPTO_JS_REQUIRE_BASE || `${process.cwd()}/`);
const CryptoJS = require('crypto-js');

const HISTORICAL_EK = process.env.HISTORICAL_EK;
const HISTORICAL_DID = process.env.HISTORICAL_DID;
const NEW_SECRET = process.env.CREDENTIAL_ENCRYPTION_KEY;
const SRC_DB = process.env.SRC_DB;

if (!HISTORICAL_EK || !HISTORICAL_DID || !NEW_SECRET || !SRC_DB) {
  console.error('Missing required env vars. Expected:');
  console.error('  HISTORICAL_EK              (from source BS docker-env, incl 0x prefix)');
  console.error('  HISTORICAL_DID             (== BLOCKLET_APP_PID of source instance)');
  console.error('  CREDENTIAL_ENCRYPTION_KEY  (CF worker secret for target env)');
  console.error('  SRC_DB                     (path to source aikit.db)');
  process.exit(1);
}

// --- Source decrypt (matches @blocklet/sdk/lib/security/index.js) ---
const oldPassword = crypto.pbkdf2Sync(HISTORICAL_EK, HISTORICAL_DID, 256, 32, 'sha512').toString('hex');

function oldDecrypt(b64) {
  const plain = CryptoJS.AES.decrypt(b64, oldPassword).toString(CryptoJS.enc.Utf8);
  if (!plain) throw new Error('decrypt failed (wrong EK or corrupted ciphertext)');
  return plain;
}

// --- Target encrypt (matches cloudflare/src/libs/crypto.ts) ---
async function newEncrypt(valueObj) {
  const key = crypto.pbkdf2Sync(
    Buffer.from(NEW_SECRET, 'utf8'),
    Buffer.from('aigne-hub-credentials', 'utf8'),
    100000,
    32,
    'sha256',
  );
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const pt = Buffer.from(JSON.stringify(valueObj), 'utf8');
  const ct = Buffer.concat([cipher.update(pt), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Web Crypto AES-GCM encrypt appends a 16-byte auth tag to the ciphertext,
  // so our layout must be: iv(12) || ciphertext || tag(16).
  return Buffer.concat([iv, ct, tag]).toString('base64');
}

const rows = JSON.parse(
  execSync(`sqlite3 -json "${SRC_DB}" "SELECT id, name, providerId, credentialValue FROM AiCredentials"`, {
    encoding: 'utf-8',
  }),
);

const updates = [];
for (const r of rows) {
  let cv;
  try {
    cv = typeof r.credentialValue === 'string' ? JSON.parse(r.credentialValue) : r.credentialValue;
  } catch {
    console.error(`[${r.id}] ${r.name}: unparseable credentialValue, skipping`);
    continue;
  }

  const plainObj = { ...cv };
  try {
    if (cv.api_key && typeof cv.api_key === 'string') {
      plainObj.api_key = oldDecrypt(cv.api_key);
    }
    if (cv.secret_access_key && typeof cv.secret_access_key === 'string') {
      plainObj.secret_access_key = oldDecrypt(cv.secret_access_key);
    }
  } catch (e) {
    console.error(`[${r.id}] ${r.name}: old decrypt failed — ${e.message}`);
    continue;
  }

  const newBlob = await newEncrypt(plainObj);
  updates.push({ id: r.id, name: r.name, blob: newBlob });
  console.error(`[${r.id}] ${r.name}: re-encrypted`);
}

console.log('-- re-encrypted AiCredentials UPDATE statements');
console.log('-- apply via CF API /d1/database/<id>/query (one stmt at a time)');
console.log('-- or via: wrangler d1 execute <db> --remote --file=<this-file>');
for (const u of updates) {
  // credentialValue is a drizzle json-mode text column, so a base64 string
  // gets stored as the JSON literal "<base64>". Escape any single quotes
  // in the payload (shouldn't occur in base64 but defensive).
  const jsonStr = JSON.stringify(u.blob).replace(/'/g, "''");
  console.log(`UPDATE AiCredentials SET credentialValue='${jsonStr}' WHERE id='${u.id}';`);
}
console.error(`\n${updates.length}/${rows.length} credentials re-encrypted.`);
