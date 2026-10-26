import { SESSION_DAYS } from "./config";
import { signToken, type TokenClaims } from "./token";

/** A different token purpose keeps guests separate from member sessions. */
export interface GuestClaims extends TokenClaims {
  use: "guest";
}

export function guestCookieValue(secret: string): Promise<string> {
  return signToken<GuestClaims>(
    { use: "guest", exp: Math.floor(Date.now() / 1000) + SESSION_DAYS * 86_400 },
    secret,
  );
}
