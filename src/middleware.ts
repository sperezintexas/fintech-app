import { NextFetchEvent, NextRequest, NextResponse } from "next/server";
import { auth } from "@/auth";

const authMiddleware = auth((req) => {
  if (!req.auth && req.nextUrl.pathname !== "/") {
    const homeUrl = new URL("/", req.nextUrl.origin);
    homeUrl.searchParams.set("callbackUrl", req.nextUrl.pathname);
    return Response.redirect(homeUrl);
  }
});

export default function middleware(req: NextRequest, event: NextFetchEvent) {
  if (process.env.SKIP_AUTH === "true") {
    return NextResponse.next();
  }
  return (authMiddleware as unknown as (req: NextRequest, ev: NextFetchEvent) => Promise<Response>)(req, event);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/auth|api/health|health|icon.svg|apple-icon.svg).*)",
  ],
};
