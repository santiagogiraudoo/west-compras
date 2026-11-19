import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import pg from "pg";

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient;
  pgPool: pg.Pool;
};

// Endpoint de la rama production de west-cc. La app no la toca hasta que Adriano
// la habilite a propósito con ALLOW_PRODUCTION=si (en Vercel production, nunca en una compu).
export const PRODUCTION_ENDPOINT = "ep-dry-art-b64ue0e8";

export function assertNotProduction(
  connectionString: string,
  allow = process.env.ALLOW_PRODUCTION,
) {
  if (connectionString.includes(PRODUCTION_ENDPOINT) && allow !== "si") {
    throw new Error(
      "DATABASE_URL apunta a la base REAL (production). Usá la rama dev-app-compras. " +
        "Solo Adriano habilita production con ALLOW_PRODUCTION=si.",
    );
  }
}

function getPool() {
  if (globalForPrisma.pgPool) return globalForPrisma.pgPool;

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL environment variable is not set");
  }
  assertNotProduction(connectionString);

  const pool = new pg.Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 30_000,
  });

  globalForPrisma.pgPool = pool;
  return pool;
}

function createPrismaClient() {
  const pool = getPool();
  const adapter = new PrismaPg(pool);
  return new PrismaClient({ adapter });
}

export const prisma = globalForPrisma.prisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
