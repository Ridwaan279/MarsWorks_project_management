import { NextResponse, type NextRequest } from "next/server";
import { memberForSignIn } from "@/lib/auth/accounts";
import { authSetup, callbackUrl, OAUTH_COOKIE, SESSION_COOKIE, SESSION_DAYS, siteUrl } from "@/lib/auth/config";
import { cookieOptions, type FlowClaims } from "@/lib/auth/flow";
import { checkIdentity, exchangeCode } from "@/lib/auth/google";
import { sessionCookieValue } from "@/lib/auth/session";
import { verifyToken } from "@/lib/auth/token";

/**
 * Google sends people back here. Every check failing lands on the sign-in
 * page with a reason it can explain; only a university account, verified,
 * gets a session.
 */
export async function GET(request: NextRequest) {
  const setup = authSetup();
  const fail = (reason: string) => {
    const response = NextResponse.redirect(siteUrl(request, `/login?error=${reason}`));
    response.cookies.set(OAUTH_COOKIE, "", cookieOptions(request, 0, "/api/auth"));
    return response;
  };
  if (setup.mode !== "on") return fail("setup");

  const params = request.nextUrl.searchParams;
  if (params.get("error")) return fail("cancelled");
  const flow = await verifyToken<FlowClaims>(request.cookies.get(OAUTH_COOKIE)?.value, setup.secret, "oauth");
  if (!flow || params.get("state") !== flow.state) return fail("expired");
  const code = params.get("code");
  if (!code) return fail("failed");

  const idToken = await exchangeCode({
    code,
    verifier: flow.verifier,
    clientId: setup.clientId,
    clientSecret: setup.clientSecret,
    redirectUri: callbackUrl(request),
  }).catch((error) => {
    console.error("Google sign-in: code exchange failed", error);
    return null;
  });
  if (!idToken) return fail("failed");

  const check = checkIdentity(idToken, { clientId: setup.clientId, nonce: flow.nonce });
  if (!check.ok) return fail(check.reason === "domain" ? "domain" : "failed");

  const member = await memberForSignIn(check.identity);
  const response = NextResponse.redirect(siteUrl(request, flow.next));
  response.cookies.set(
    SESSION_COOKIE,
    await sessionCookieValue(member.id, setup.secret),
    cookieOptions(request, SESSION_DAYS * 86_400),
  );
  response.cookies.set(OAUTH_COOKIE, "", cookieOptions(request, 0, "/api/auth"));
  return response;
}
