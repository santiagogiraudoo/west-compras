import { auth } from "@/lib/auth";
import type { NextRequest } from "next/server";
import { FAKE_DATE_COOKIE, setFakeOffset, computeFakeOffset } from "@/lib/dev/fake-date";

// Mismo patrón que la app de alquileres: todo pide sesión salvo el login.
export async function proxy(request: NextRequest) {
  const session = await auth();

  // Fecha simulada para probar lo que pasa día a día (vencimientos, "esta semana",
  // "hace N días"). Como el modo dios de alquileres, pero solo en desarrollo y para un
  // admin: en producción la cookie se ignora siempre.
  const simula = process.env.NODE_ENV === "development" && session?.user?.role === "admin";
  setFakeOffset(computeFakeOffset(simula ? request.cookies.get(FAKE_DATE_COOKIE)?.value : undefined));

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
  // api/whatsapp lo llama Meta sin sesión: se protege con la firma del webhook (route.ts).
  matcher: ["/((?!api/auth|api/whatsapp|_next/static|_next/image|images|favicon.ico|docs).*)"],
};
