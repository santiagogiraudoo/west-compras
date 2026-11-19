import { describe, expect, it } from "vitest";
import { computeFakeOffset } from "./fake-date";

/** Hoy en Mendoza, como hoyArgentina(), corrido por el offset. */
const hoyMendoza = (ms: number) => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza" }).format(new Date(ms));

describe("computeFakeOffset", () => {
  const ahora = Date.parse("2026-11-19T15:00:00Z");
  it("la fecha de la cookie es ese mismo día en Mendoza (antes daba uno menos)", () => {
    expect(hoyMendoza(ahora + computeFakeOffset("2026-11-20", ahora))).toBe("2026-11-20");
    expect(hoyMendoza(ahora + computeFakeOffset("2026-12-01", ahora))).toBe("2026-12-01");
  });
  it("sin cookie o con basura, no corre nada", () => {
    expect(computeFakeOffset(undefined, ahora)).toBe(0);
    expect(computeFakeOffset("mañana", ahora)).toBe(0);
    expect(computeFakeOffset("2026-11-20T10:00", ahora)).toBe(0);
  });
});
