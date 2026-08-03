import { createCipheriv, createDecipheriv, randomBytes } from "crypto";

// Server-only AEAD helper (AES-256-GCM) for secrets that must never be stored in
// plaintext: Google refresh tokens and PKCE code_verifiers. Reused by the Drive
// connection flow now and by the inventory-sync task later.

const ALGORITHM = "aes-256-gcm";
const NONCE_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;

/** Bump this and branch key selection in getKey()/decryptSecret() when rotating keys. */
export const CURRENT_KEY_VERSION = 1;

export interface EncryptedSecret {
  ciphertext: Buffer;
  nonce: Buffer;
  aad: Buffer;
  keyVersion: number;
}

function getKey(): Buffer {
  const encoded = process.env.GOOGLE_TOKEN_ENCRYPTION_KEY;
  if (!encoded) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must be configured.");
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32) {
    throw new Error("GOOGLE_TOKEN_ENCRYPTION_KEY must base64-decode to 32 bytes.");
  }
  return key;
}

/**
 * Encrypts `plaintext` with AES-256-GCM. `context` (e.g. "google-refresh-token" or
 * "google-pkce-verifier") is used as the AAD, binding the ciphertext to its purpose
 * so a secret encrypted for one use can't be swapped in for another even though both
 * currently share the same key. The GCM auth tag is appended to the returned
 * ciphertext buffer so callers only need to persist one blob for it.
 */
export function encryptSecret(plaintext: string, context: string): EncryptedSecret {
  const key = getKey();
  const nonce = randomBytes(NONCE_LENGTH);
  const aad = Buffer.from(context, "utf8");

  const cipher = createCipheriv(ALGORITHM, key, nonce);
  cipher.setAAD(aad);
  const encrypted = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return {
    ciphertext: Buffer.concat([encrypted, authTag]),
    nonce,
    aad,
    keyVersion: CURRENT_KEY_VERSION,
  };
}

/** Decrypts a secret produced by `encryptSecret`. Throws if the AAD/nonce/key don't match (tampered or wrong context). */
export function decryptSecret({ ciphertext, nonce, aad, keyVersion }: EncryptedSecret): string {
  if (keyVersion !== CURRENT_KEY_VERSION) {
    throw new Error(`Unsupported encryption key version: ${keyVersion}`);
  }
  const key = getKey();
  const authTag = ciphertext.subarray(ciphertext.length - AUTH_TAG_LENGTH);
  const encrypted = ciphertext.subarray(0, ciphertext.length - AUTH_TAG_LENGTH);

  const decipher = createDecipheriv(ALGORITHM, key, nonce);
  decipher.setAAD(aad);
  decipher.setAuthTag(authTag);

  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString("utf8");
}

/** Encodes a Buffer as a Postgres `bytea` hex-text literal for PostgREST inserts/updates. */
export function toBytea(buffer: Buffer): string {
  return `\\x${buffer.toString("hex")}`;
}

/** Decodes a `bytea` value as returned by PostgREST (hex-text form) back into a Buffer. */
export function fromBytea(value: string): Buffer {
  const hex = value.startsWith("\\x") ? value.slice(2) : value;
  return Buffer.from(hex, "hex");
}
