import { describe, expect, it, vi } from "vitest";

vi.mock("@/generated/prisma/client", () => ({ PrismaClient: class {} }));
vi.mock("@prisma/adapter-pg", () => ({ PrismaPg: class {} }));
vi.stubEnv("DATABASE_URL", "postgresql://x@ep-nameless-hill-b6yh5222-pooler/neondb");

const { assertNotProduction } = await import("@/lib/prisma");

const prod = "postgresql://app_compras:x@ep-dry-art-b64ue0e8-pooler.c-2.sa-east-1.aws.neon.tech/neondb";
const dev = "postgresql://app_compras:x@ep-nameless-hill-b6yh5222-pooler.c-2.sa-east-1.aws.neon.tech/neondb";

describe("candado de production", () => {
  it("frena la base real", () => {
    expect(() => assertNotProduction(prod, undefined)).toThrow(/production/);
  });
  it("deja pasar production solo con ALLOW_PRODUCTION=si", () => {
    expect(() => assertNotProduction(prod, "si")).not.toThrow();
  });
  it("deja pasar dev", () => {
    expect(() => assertNotProduction(dev, undefined)).not.toThrow();
  });
});
