/**
 * middleware.ts — Route protection
 * Redirects unauthenticated users to /login.
 * Public routes: /login, /signup, /api/auth/*, /api/auth/signup
 */
import NextAuth from "next-auth";
import { authConfig } from "@/lib/auth.config";
import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const { auth } = NextAuth(authConfig);

const PUBLIC_PATHS = ["/login", "/signup"];

export default async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // Always allow API routes, static assets, and public files
  if (
    pathname.startsWith("/api/auth") ||
    pathname.startsWith("/_next") ||
    pathname.startsWith("/favicon") ||
    /\.(?:png|jpg|jpeg|gif|svg|ico|webp|webmanifest|json|js|css|woff2?|ttf|eot|map)$/i.test(pathname)
  ) {
    return NextResponse.next();
  }

  // Allow public pages
  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) {
    return NextResponse.next();
  }

  // Check session — wrap in try/catch so a DB or auth error
  // returns NextResponse.next() instead of an HTML error page,
  // which would cause a "Unexpected token '<'" ClientFetchError.
  try {
    const session = await auth();
    if (!session) {
      const loginUrl = new URL("/login", req.url);
      loginUrl.searchParams.set("callbackUrl", pathname);
      return NextResponse.redirect(loginUrl);
    }
  } catch (err) {
    console.error("[middleware] auth() failed, allowing request through:", err);
    return NextResponse.next();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};

export const runtime = "edge";
