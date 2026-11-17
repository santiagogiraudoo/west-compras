import { DefaultSession } from "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: Omit<NonNullable<DefaultSession["user"]>, "id"> & {
      id: number;
      role: string;
      isGod: boolean;
    };
  }

  interface User {
    role?: string;
    isGod?: boolean;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    role?: string;
    userId?: number;
    isGod?: boolean;
  }
}
