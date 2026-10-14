/**
 * Signing in with Google: OpenID Connect's authorization-code flow, with PKCE,
 * a state value and a nonce.
 *
 * The ID token is not signature-checked, deliberately. It comes straight from
 * Google's token endpoint over TLS in exchange for a code only this site's
 * secret can redeem, which OpenID Connect Core (3.1.3.7) accepts in place of
 * the signature. Its claims are still checked: issuer, audience, expiry and
 * nonce, and above all the account.
 */
import { ALLOWED_DOMAIN, GOOGLE_ENDPOINTS } from "./config";
import { decodeJwtPayload } from "./token";

export function authorizationUrl(input: {
  clientId: string;
  redirectUri: string;
  state: string;
  nonce: string;
  codeChallenge: string;
}): string {
  const url = new URL(GOOGLE_ENDPOINTS.authorize());
  url.search = new URLSearchParams({
    client_id: input.clientId,
    redirect_uri: input.redirectUri,
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: input.codeChallenge,
    code_challenge_method: "S256",
    // Offers only university accounts on Google's chooser. A hint: the real
    // check is in checkIdentity.
    hd: ALLOWED_DOMAIN,
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Trades the code Google sent back for an ID token. */
export async function exchangeCode(input: {
  code: string;
  verifier: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}): Promise<string | null> {
  const response = await fetch(GOOGLE_ENDPOINTS.token(), {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      code_verifier: input.verifier,
      client_id: input.clientId,
      client_secret: input.clientSecret,
      redirect_uri: input.redirectUri,
    }),
    cache: "no-store",
  });
  if (!response.ok) return null;
  const body = (await response.json().catch(() => null)) as { id_token?: unknown } | null;
  return typeof body?.id_token === "string" ? body.id_token : null;
}

export interface Identity {
  email: string;
  name: string;
  givenName: string;
  familyName: string;
}

export type IdentityCheck =
  | { ok: true; identity: Identity }
  | { ok: false; reason: "domain" | "invalid" };

const ISSUERS = new Set(["https://accounts.google.com", "accounts.google.com"]);

/**
 * Whether an ID token names someone who may sign in: a verified address at
 * the university, on an account the university manages. The `hd` claim is
 * what rules out a personal Google account that merely uses a university
 * address -- whose display name, unlike a university account's, its owner
 * can set to anything.
 */
export function checkIdentity(
  idToken: string,
  expected: { clientId: string; nonce: string; now?: number },
): IdentityCheck {
  const claims = decodeJwtPayload(idToken);
  if (!claims) return { ok: false, reason: "invalid" };
  const now = expected.now ?? Date.now();
  const audience = claims.aud;
  const audienceOk = Array.isArray(audience) ? audience.includes(expected.clientId) : audience === expected.clientId;
  if (
    !ISSUERS.has(String(claims.iss)) ||
    !audienceOk ||
    typeof claims.exp !== "number" ||
    claims.exp * 1000 <= now ||
    claims.nonce !== expected.nonce
  ) {
    return { ok: false, reason: "invalid" };
  }

  const email = typeof claims.email === "string" ? claims.email.trim().toLowerCase() : "";
  const verified = claims.email_verified === true || claims.email_verified === "true";
  if (!email || !verified || !email.endsWith(`@${ALLOWED_DOMAIN}`) || claims.hd !== ALLOWED_DOMAIN) {
    return { ok: false, reason: "domain" };
  }

  const text = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const givenName = text(claims.given_name);
  const familyName = text(claims.family_name);
  const name = text(claims.name) || [givenName, familyName].filter(Boolean).join(" ") || email.split("@")[0];
  return { ok: true, identity: { email, name, givenName, familyName } };
}
