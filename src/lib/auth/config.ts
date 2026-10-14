/**
 * Sign-in settings, from the environment. See docs/sign-in.md for setting
 * them up in Google Cloud and Vercel.
 *
 * Until all three are set, sign-in is "off" and the site stays open as it was,
 * with a banner saying so: switching this on must not lock the team out
 * between a deploy and someone adding the keys. Some but not all set is
 * "incomplete", which locks the site rather than guessing.
 */

/** Only addresses at this domain, on accounts the university manages. */
export const ALLOWED_DOMAIN = "sheffield.ac.uk";

export const SESSION_COOKIE = "mw_session";
export const OAUTH_COOKIE = "mw_oauth";
/** How long a sign-in lasts before Google is asked again. */
export const SESSION_DAYS = 30;

const REQUIRED = ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "AUTH_SECRET"] as const;

export type AuthSetup =
  | { mode: "off" }
  | { mode: "incomplete"; missing: string[] }
  | { mode: "on"; clientId: string; clientSecret: string; secret: string };

export function authSetup(): AuthSetup {
  const values = REQUIRED.map((name) => process.env[name]?.trim() ?? "");
  const missing = REQUIRED.filter((_, i) => !values[i]);
  if (missing.length === REQUIRED.length) return { mode: "off" };
  // A short secret would make the session signature guessable.
  if ((values[2] ?? "").length > 0 && (values[2] ?? "").length < 32) {
    return { mode: "incomplete", missing: ["AUTH_SECRET (at least 32 characters)"] };
  }
  if (missing.length > 0) return { mode: "incomplete", missing: [...missing] };
  return { mode: "on", clientId: values[0], clientSecret: values[1], secret: values[2] };
}

/**
 * Google's endpoints. The overrides exist only so the sign-in flow can be
 * tested end to end against a stand-in; leave them unset.
 */
export const GOOGLE_ENDPOINTS = {
  authorize: () => process.env.AUTH_GOOGLE_AUTHORIZE_URL || "https://accounts.google.com/o/oauth2/v2/auth",
  token: () => process.env.AUTH_GOOGLE_TOKEN_URL || "https://oauth2.googleapis.com/token",
};

/**
 * The address people reach the site at: AUTH_URL when set, otherwise the
 * host and protocol the browser actually asked for. Not the request's own
 * URL, which `next start` rewrites to localhost -- a sign-in that left from
 * one address and came back to another would lose its cookie.
 */
export function publicOrigin(request: Request): string {
  const pinned = process.env.AUTH_URL?.trim();
  if (pinned) return new URL(pinned).origin;
  const first = (value: string | null) => value?.split(",")[0]?.trim() || null;
  const url = new URL(request.url);
  const host = first(request.headers.get("x-forwarded-host")) ?? request.headers.get("host");
  const proto = first(request.headers.get("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  return host ? `${proto}://${host}` : url.origin;
}

/** Where Google sends people back: must be listed on the Google client. */
export function callbackUrl(request: Request): string {
  return new URL("/api/auth/callback", publicOrigin(request)).toString();
}

/** An address on this site, as the browser knows it. */
export function siteUrl(request: Request, path: string): URL {
  return new URL(path, publicOrigin(request));
}

/** A same-site path to return to after signing in, never another site. */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/";
  if (next.startsWith("/login") || next.startsWith("/api/auth")) return "/";
  return next;
}
