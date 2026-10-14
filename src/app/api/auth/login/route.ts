import { NextResponse, type NextRequest } from "next/server";
import { authSetup, callbackUrl, OAUTH_COOKIE, safeNext, siteUrl } from "@/lib/auth/config";
import { cookieOptions, FLOW_MINUTES, type FlowClaims } from "@/lib/auth/flow";
import { authorizationUrl } from "@/lib/auth/google";
import { pkceChallenge, randomToken, signToken } from "@/lib/auth/token";

/** Starts a sign-in: off to Google, with what is needed to check the way back. */
export async function GET(request: NextRequest) {
  const setup = authSetup();
  if (setup.mode !== "on") return NextResponse.redirect(siteUrl(request, "/login?error=setup"));

  const flow: FlowClaims = {
    use: "oauth",
    state: randomToken(),
    nonce: randomToken(),
    verifier: randomToken(48),
    next: safeNext(request.nextUrl.searchParams.get("next")),
    exp: Math.floor(Date.now() / 1000) + FLOW_MINUTES * 60,
  };
  const response = NextResponse.redirect(
    authorizationUrl({
      clientId: setup.clientId,
      redirectUri: callbackUrl(request),
      state: flow.state,
      nonce: flow.nonce,
      codeChallenge: await pkceChallenge(flow.verifier),
    }),
  );
  response.cookies.set(
    OAUTH_COOKIE,
    await signToken(flow, setup.secret),
    cookieOptions(request, FLOW_MINUTES * 60, "/api/auth"),
  );
  return response;
}
