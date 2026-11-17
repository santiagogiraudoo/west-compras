import { prisma } from "@/lib/prisma";

export interface RevalidatableToken {
  userId?: number;
  role?: string;
}

/**
 * Per-request session revalidation. Looks the user up by id and:
 *  - returns null (force sign-out) if the user is gone or deactivated,
 *  - returns the token with a refreshed role if the DB role changed,
 *  - returns the token unchanged if active and unchanged.
 * A token without a userId (the brief pre-authorize state) passes through untouched.
 */
export async function revalidateToken<T extends RevalidatableToken>(
  token: T
): Promise<T | null> {
  if (token.userId == null) return token;

  const user = await prisma.user.findUnique({
    where: { id: token.userId },
    select: { id: true, role: true, active: true },
  });

  if (!user || !user.active) return null;

  if (user.role !== token.role) {
    return { ...token, role: user.role };
  }
  return token;
}
