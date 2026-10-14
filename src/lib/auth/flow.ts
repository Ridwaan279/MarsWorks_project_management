/**
 * The short-lived cookie that carries a sign-in from leaving for Google to
 * coming back: the state to compare, the nonce Google must echo, the PKCE
 * verifier, and where to land afterwards. Signed, httpOnly, ten minutes.
 */
import type { TokenClaims } from "./token";

export interface FlowClaims extends TokenClaims {
  use: "oauth";
  state: string;
  nonce: string;
  verifier: string;
  next: string;
}

export const FLOW_MINUTES = 10;

import { publicOrigin } from "./config";

/** Cookie options shared by the sign-in routes. */
export function cookieOptions(request: Request, maxAgeSeconds: number, path = "/") {
  return {
    httpOnly: true,
    secure: publicOrigin(request).startsWith("https:"),
    sameSite: "lax" as const,
    path,
    maxAge: maxAgeSeconds,
  };
}
