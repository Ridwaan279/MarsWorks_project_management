/**
 * Small signed tokens for cookies: a JSON payload and an HMAC-SHA256 of it,
 * both base64url, joined by a dot. Web Crypto only, so the same code runs in
 * the proxy and in route handlers.
 *
 * Signed, not encrypted: never put anything in one that its holder should not
 * read. Every token carries `exp` (seconds since the epoch) and a `use`, so a
 * token made for one purpose is never accepted for another.
 */

const encoder = new TextEncoder();
const decoder = new TextDecoder();

function toBase64Url(bytes: Uint8Array): string {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function fromBase64Url(text: string): Uint8Array<ArrayBuffer> | null {
  if (!/^[A-Za-z0-9_-]*$/.test(text)) return null;
  const padded = text.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (text.length % 4)) % 4);
  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
    return bytes;
  } catch {
    return null;
  }
}

async function hmacKey(secret: string): Promise<CryptoKey> {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, [
    "sign",
    "verify",
  ]);
}

export interface TokenClaims {
  use: string;
  /** Expiry, in seconds since the epoch. */
  exp: number;
}

export async function signToken<T extends TokenClaims>(claims: T, secret: string): Promise<string> {
  const body = toBase64Url(encoder.encode(JSON.stringify(claims)));
  const signature = await crypto.subtle.sign("HMAC", await hmacKey(secret), encoder.encode(body));
  return `${body}.${toBase64Url(new Uint8Array(signature))}`;
}

/**
 * The claims, if the signature is good, the token is unexpired and made for
 * `use`; otherwise null. The comparison is Web Crypto's, which runs in
 * constant time.
 */
export async function verifyToken<T extends TokenClaims>(
  token: string | undefined | null,
  secret: string,
  use: string,
  now: number = Date.now(),
): Promise<T | null> {
  if (!token) return null;
  const [body, signature, extra] = token.split(".");
  if (!body || !signature || extra !== undefined) return null;
  const signatureBytes = fromBase64Url(signature);
  if (!signatureBytes) return null;
  const valid = await crypto.subtle.verify("HMAC", await hmacKey(secret), signatureBytes, encoder.encode(body));
  if (!valid) return null;
  const bytes = fromBase64Url(body);
  if (!bytes) return null;
  let claims: T;
  try {
    claims = JSON.parse(decoder.decode(bytes)) as T;
  } catch {
    return null;
  }
  if (claims.use !== use || typeof claims.exp !== "number" || claims.exp * 1000 <= now) return null;
  return claims;
}

/** URL-safe random text, for OAuth state, nonces and PKCE verifiers. */
export function randomToken(bytes = 32): string {
  return toBase64Url(crypto.getRandomValues(new Uint8Array(bytes)));
}

/** PKCE's S256 challenge for a verifier. */
export async function pkceChallenge(verifier: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(verifier));
  return toBase64Url(new Uint8Array(digest));
}

/** The payload of a JWT, unverified. See google.ts for why that is enough there. */
export function decodeJwtPayload(jwt: string): Record<string, unknown> | null {
  const parts = jwt.split(".");
  if (parts.length !== 3) return null;
  const bytes = fromBase64Url(parts[1]);
  if (!bytes) return null;
  try {
    const value = JSON.parse(decoder.decode(bytes));
    return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
  } catch {
    return null;
  }
}
