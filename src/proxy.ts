import { auth } from "@/lib/auth";
import type { NextRequest } from "next/server";

// Mismo patrón que la app de alquileres, sin el god mode: todo pide sesión salvo el login.
export async function proxy(request: NextRequest) {
  const session = await auth();
  const pathname = request.nextUrl.pathname;
  const isLoggedIn = !!session?.user;
  const isOnLogin = pathname.startsWith("/login");

  if (isOnLogin && isLoggedIn) return Response.redirect(new URL("/", request.url));
  if (!isOnLogin && !isLoggedIn) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname + request.nextUrl.search);
    return Response.redirect(loginUrl);
  }
}

export const config = {
  matcher: ["/((?!api/auth|_next/static|_next/image|images|favicon.ico|docs).*)"],
};
