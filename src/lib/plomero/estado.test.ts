import { describe, expect, it } from "vitest";
import { estadoGeneral, estadoProceso, type Proceso } from "./estado";

describe("estadoGeneral", () => {
  const ahora = "2026-11-18T15:00:00.000Z";
  it("andando si corrió hace 75 minutos o menos, en cualquier horario", () => {
    expect(estadoGeneral("2026-11-18T14:00:00.000Z", ahora, 12, 3)).toBe("Andando");
    expect(estadoGeneral("2026-11-18T14:00:00.000Z", ahora, 23, 0)).toBe("Andando");
  });
  it("parado si no corre en horario; fuera de horario, descansa", () => {
    expect(estadoGeneral("2026-11-18T10:00:00.000Z", ahora, 12, 3)).toBe("Parado");
    expect(estadoGeneral("2026-11-18T10:00:00.000Z", ahora, 22, 3)).toBe("Descansa");
    expect(estadoGeneral(null, ahora, 11, 6)).toBe("Descansa");
  });
});

describe("estadoProceso", () => {
  const p = (o: Partial<Proceso> = {}): Proceso => ({
    proceso: "facturas", modo: "real", ultima: "", resultado: "ok", procesados: 0, err7: 0, corr24: 5, ultima_novedad: "", error: "", ignorado: false, ...o,
  });
  it("sombra es prueba; error sin silenciar es error; sin corridas en 24 h, quieto", () => {
    expect(estadoProceso(p({ modo: "sombra", resultado: "error" }))).toBe("prueba");
    expect(estadoProceso(p({ resultado: "error" }))).toBe("error");
    expect(estadoProceso(p({ resultado: "error", ignorado: true }))).toBe("ok");
    expect(estadoProceso(p({ corr24: 0 }))).toBe("quieto");
    expect(estadoProceso(p({ proceso: "respaldo", corr24: 0 }))).toBe("ok");
  });
});
