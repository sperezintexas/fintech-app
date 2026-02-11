import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const authProxy = auth((req) => {
  if (!req.auth) {
    const contactUrl = new URL("/contact", req.nextUrl.origin);
    contactUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(contactUrl);
  }
});

function applySecurityHeaders(res: NextResponse): NextResponse {
  res.headers.set("X-Content-Type-Options", "nosniff");
  res.headers.set("X-Frame-Options", "DENY");
  res.headers.set("X-XSS-Protection", "1; mode=block");
  res.headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  res.headers.set(
    "Content-Security-Policy",
    "default-src 'self'; script-src 'self' 'unsafe-eval' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self' data: https:; connect-src 'self' https://*.yahoo.com https://api.slack.com https://api.twitter.com https://api.openai.com;"
  );
  return res;
}

export async function proxy(req: NextRequest, event: NextFetchEvent) {
  if (process.env.SKIP_AUTH === "true") {
    return applySecurityHeaders(NextResponse.next());
  }
  const response = await (authProxy as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response>)(
    req,
    event
  );
  const nextRes = response instanceof NextResponse ? response : NextResponse.next();
  return applySecurityHeaders(nextRes);
}

export const config = {
  matcher: [
    // Same as old middleware: exclude api, _next, favicon; plus auth public routes
    "/((?!api|_next/static|_next/image|favicon.ico|health|icon.svg|apple-icon.svg|contact|login-error).*)",
  ],
};
