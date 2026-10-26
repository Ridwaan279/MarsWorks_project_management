import { NextResponse, type NextRequest } from "next/server";
import { authSetup, publicOrigin, SESSION_COOKIE, siteUrl } from "@/lib/auth/config";
import { verifyToken } from "@/lib/auth/token";

/**
 * The front door. Every page and API route needs a valid session cookie,
 * except signing in itself, the privacy policy, the health check, and the
 * Google Sheets sync -- which Google's servers call, and which checks its own secret.
 *
 * Only the cookie's signature and expiry are checked here, as Next.js
 * advises for a proxy; who someone is and what they may do is checked again
 * where it matters (src/lib/auth/session.ts).
 */
const OPEN = [
  /^\/login$/,
  /^\/privacy$/,
  /^\/api\/auth\//,
  /^\/api\/sheets\/sync$/,
  /^\/api\/health$/,
];

export async function proxy(request: NextRequest) {
  const setup = authSetup();
  // Not set up yet: the site stays open, with a banner, rather than locking
  // everyone out until the keys are added. See src/lib/auth/config.ts.
  if (setup.mode === "off") return NextResponse.next();

  const { pathname, search } = request.nextUrl;
  if (OPEN.some((pattern) => pattern.test(pathname))) return NextResponse.next();
  const isApi = pathname.startsWith("/api/");

  if (setup.mode === "incomplete") {
    return isApi
      ? NextResponse.json({ error: "Sign-in is only partly set up." }, { status: 503 })
      : NextResponse.redirect(siteUrl(request, "/login?error=setup"));
  }

  // A change from another site is refused outright. The session cookie is
  // SameSite=Lax, which already keeps it off such requests; this is a second
  // lock on the same door.
  if (isApi && !["GET", "HEAD", "OPTIONS"].includes(request.method)) {
    const origin = request.headers.get("origin");
    let sameSite = true;
    if (origin) {
      try {
        sameSite = new URL(origin).host === new URL(publicOrigin(request)).host;
      } catch {
        sameSite = false;
      }
    }
    if (!sameSite) return NextResponse.json({ error: "Cross-site request refused." }, { status: 403 });
  }

  const session = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value, setup.secret, "session");
  if (session) return NextResponse.next();
  const guest = await verifyToken(request.cookies.get(SESSION_COOKIE)?.value, setup.secret, "guest");
  if (guest) {
    if (!["GET", "HEAD", "OPTIONS"].includes(request.method)) {
      return NextResponse.json(
        { error: "Guest access is read-only. Sign in with Google to make changes." },
        { status: 403 },
      );
    }
    return NextResponse.next();
  }

  if (isApi) return NextResponse.json({ error: "Sign in first." }, { status: 401 });
  const login = siteUrl(request, "/login");
  if (pathname !== "/") login.searchParams.set("next", pathname + search);
  return NextResponse.redirect(login);
}

export const config = {
  // Everything but Next's own files and images.
  matcher: ["/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:png|jpg|jpeg|svg|gif|webp|ico|txt|xml)$).*)"],
};
