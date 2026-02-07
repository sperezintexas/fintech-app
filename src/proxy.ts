import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const authProxy = auth((req) => {
  if (!req.auth) {
    const contactUrl = new URL("/contact", req.nextUrl.origin);
    contactUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(contactUrl);
  }
});

export function proxy(req: NextRequest, event: NextFetchEvent) {
  if (process.env.SKIP_AUTH === "true") {
    return NextResponse.next();
  }
  return (authProxy as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response>)(req, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/health|health|icon.svg|apple-icon.svg|contact|login-error).*)",
  ],
};
