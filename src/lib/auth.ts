import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { revalidateToken } from "@/lib/auth-token";

export const { handlers, auth, signIn, signOut } = NextAuth({
  trustHost: true,
  session: { strategy: "jwt" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email as string },
        });

        if (!user || !user.active) return null;

        const valid = await bcrypt.compare(
          credentials.password as string,
          user.password_hash
        );

        if (!valid) return null;

        return {
          id: String(user.id),
          name: user.name,
          email: user.email,
          role: user.role,
          isGod: false,
        };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.role = user.role;
        token.userId = Number(user.id);
        token.isGod = (user as { isGod?: boolean }).isGod ?? false;
        return token;
      }
      // Subsequent requests: revalidate against the DB so deactivation and
      // role changes take effect immediately instead of after the 30-day expiry.
      const revalidated = await revalidateToken(
        token as { userId?: number; role?: string }
      );
      return revalidated as typeof token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.role = token.role as string;
        (session.user as { id: number }).id = token.userId as number;
        session.user.isGod = (token.isGod as boolean) ?? false;
      }
      return session;
    },
  },
  pages: {
    signIn: "/login",
  },
});
