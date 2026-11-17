"use client";

import { SessionProvider as NextAuthSessionProvider } from "next-auth/react";
import type { Session } from "next-auth";

/**
 * Sin `session` inicial, cada consumidor de `useSession()` empuja al cliente a
 * pedirle la sesión al servidor: medido, 24 GET /api/auth/session para abrir UN
 * contrato, y cada uno paga su consulta a `users` por el revalidado del token.
 * La sesión ya está resuelta en el layout (server component) — se la pasamos.
 */
export function SessionProvider({
  children,
  session,
}: {
  children: React.ReactNode;
  session: Session | null;
}) {
  return (
    <NextAuthSessionProvider session={session}>
      {children}
    </NextAuthSessionProvider>
  );
}
