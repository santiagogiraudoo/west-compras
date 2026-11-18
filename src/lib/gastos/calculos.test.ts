import { describe, expect, it } from "vitest";
import { mesVecino, totalesPorDestino } from "./calculos";

describe("totalesPorDestino", () => {
  it("suma por propiedad o unidad sola, y por categoría adentro", () => {
    const t = totalesPorDestino([
      { destino: "Nevado Golf (propiedad 1)", unidad: "CASA NEVADO GOLF", categoria: "Reparaciones", importe: "50.00" },
      { destino: "Nevado Golf (propiedad 2)", unidad: "CASA NEVADO GOLF", categoria: "Reparaciones", importe: "50.00" },
      { destino: null, unidad: "OFICINA", categoria: "Insumos de oficina", importe: "300.10" },
      { destino: null, unidad: "OFICINA", categoria: null, importe: "0.20" },
    ]);
    expect(t.map((x) => [x.donde, x.esUnidad, x.total])).toEqual([
      ["OFICINA", true, "300.30"],
      ["Nevado Golf (propiedad 1)", false, "50.00"],
      ["Nevado Golf (propiedad 2)", false, "50.00"],
    ]);
    expect(t[0].porCategoria).toEqual([
      { categoria: "Insumos de oficina", total: "300.10" }, { categoria: "Sin categoría", total: "0.20" },
    ]);
  });
});

describe("mesVecino", () => {
  it("cruza el año", () => {
    expect(mesVecino("2026-01", -1)).toBe("2025-12");
    expect(mesVecino("2026-12", 1)).toBe("2027-01");
  });
});
