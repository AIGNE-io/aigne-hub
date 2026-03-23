/**
 * Credential encryption using AES-GCM via Web Crypto API.
 * Encryption key is derived from the CREDENTIAL_ENCRYPTION_KEY Worker secret.
 */

// Derive an AES-GCM key from a string secret
async function deriveKey(secret: string): Promise<CryptoKey> {
  const encoder = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    encoder.encode(secret),
    { name: 'PBKDF2' },
    false,
    ['deriveKey']
  );
  return crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: encoder.encode('aigne-hub-credentials'),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
}

// Encrypt a credential value. Returns a base64 string of iv:ciphertext
export async function encryptCredential(value: unknown, secret: string): Promise<string> {
  const key = await deriveKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encoder = new TextEncoder();
  const data = encoder.encode(JSON.stringify(value));

  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );

  // Combine iv + ciphertext and base64 encode
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv);
  combined.set(new Uint8Array(ciphertext), iv.length);

  return btoa(String.fromCharCode(...combined));
}

// Decrypt a credential value. Input is the base64 string from encryptCredential
export async function decryptCredential(encrypted: string, secret: string): Promise<unknown> {
  const key = await deriveKey(secret);
  const combined = Uint8Array.from(atob(encrypted), (c) => c.charCodeAt(0));

  const iv = combined.slice(0, 12);
  const ciphertext = combined.slice(12);

  const decrypted = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    ciphertext
  );

  const decoder = new TextDecoder();
  return JSON.parse(decoder.decode(decrypted));
}

// Check if a value looks like an encrypted credential (base64 string)
export function isEncrypted(value: unknown): boolean {
  if (typeof value !== 'string') return false;
  try {
    const decoded = atob(value);
    // AES-GCM: 12-byte IV + at least 16-byte tag = minimum 28 bytes
    return decoded.length >= 28;
  } catch {
    return false;
  }
}
