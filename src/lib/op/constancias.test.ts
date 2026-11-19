import { describe, expect, it } from "vitest";
import { MAX_CONSTANCIA, problemaConstancia } from "./constancias";

describe("problemaConstancia", () => {
  it("acepta fotos y PDF de hasta 5 MB", () => {
    expect(problemaConstancia({ type: "image/jpeg", size: 1000 })).toBeNull();
    expect(problemaConstancia({ type: "application/pdf", size: MAX_CONSTANCIA })).toBeNull();
  });
  it("rechaza vacío, otro tipo o más pesado", () => {
    expect(problemaConstancia(null)).toMatch(/Elegí/);
    expect(problemaConstancia({ type: "image/jpeg", size: 0 })).toMatch(/Elegí/);
    expect(problemaConstancia({ type: "application/zip", size: 10 })).toMatch(/foto/);
    expect(problemaConstancia({ type: "image/png", size: MAX_CONSTANCIA + 1 })).toMatch(/5 MB/);
  });
});
