import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE, siteUrl } from "@/lib/auth/config";
import { cookieOptions } from "@/lib/auth/flow";

/** Signs out. POST only, so a link elsewhere cannot sign anyone out. */
export async function POST(request: NextRequest) {
  const response = NextResponse.redirect(siteUrl(request, "/login?signedOut=1"), 303);
  response.cookies.set(SESSION_COOKIE, "", cookieOptions(request, 0));
  return response;
}
