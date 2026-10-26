import { NextResponse, type NextRequest } from "next/server";
import { authSetup, publicOrigin, safeNext, SESSION_COOKIE, SESSION_DAYS, siteUrl } from "@/lib/auth/config";
import { cookieOptions } from "@/lib/auth/flow";
import { guestCookieValue } from "@/lib/auth/guest";
import { currentViewer } from "@/lib/auth/session";

export async function POST(request: NextRequest) {
  const setup = authSetup();
  if (setup.mode !== "on") return NextResponse.redirect(siteUrl(request, "/login?error=setup"), 303);
  const origin = request.headers.get("origin");
  if (origin && origin !== publicOrigin(request)) {
    return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  const response = NextResponse.redirect(siteUrl(request, safeNext(request.nextUrl.searchParams.get("next"))), 303);
  // Do not replace an already signed-in member with a guest session.
  if ((await currentViewer()).member) return response;
  response.cookies.set(SESSION_COOKIE, await guestCookieValue(setup.secret), cookieOptions(request, SESSION_DAYS * 86_400));
  return response;
}
