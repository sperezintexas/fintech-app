import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const authProxy = auth((req) => {
  if (!req.auth) {
    const contactUrl = new URL("/contact", req.nextUrl.origin);
    contactUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(contactUrl);
  }
});

const SECURITY_HEADERS: [string, string][] = [
  ["X-Content-Type-Options", "nosniff"],
  ["X-Frame-Options", "DENY"],
  ["X-XSS-Protection", "1; mode=block"],
  ["Referrer-Policy", "strict-origin-when-cross-origin"],
  [
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://*.yahoo.com https://api.slack.com https://api.twitter.com https://api.openai.com;",
  ],
];

function applySecurityHeaders(res: NextResponse): NextResponse {
  for (const [k, v] of SECURITY_HEADERS) res.headers.set(k, v);
  return res;
}

function applySecurityHeadersToResponse(res: Response): Response {
  const headers = new Headers(res.headers);
  for (const [k, v] of SECURITY_HEADERS) headers.set(k, v);
  return new Response(res.body, { status: res.status, statusText: res.statusText, headers });
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (process.env.SKIP_AUTH === "true") {
    return applySecurityHeaders(NextResponse.next());
  }
  const response = await (authProxy as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response>)(
    req,
    event
  );
  if (response instanceof NextResponse) {
    return applySecurityHeaders(response);
  }
  return applySecurityHeadersToResponse(response);
}

export const config = {
  matcher: [
    // Run on all routes except static assets and public/auth endpoints (proxy runs on /api/chat, /api/accounts, etc.)
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/health|health|icon.svg|apple-icon.svg|contact|login-error).*)",
  ],
};
