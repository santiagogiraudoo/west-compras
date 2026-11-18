import { describe, expect, it } from "vitest";
import { matrizGastos, mesVecino, serieGastos, totalesPorDestino, variacion } from "./calculos";

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

describe("serieGastos", () => {
  it("todos los meses, aunque estén vacíos; sin categoría se nombra", () => {
    const s = serieGastos(["2026-10", "2026-11"], [
      { mes: "2026-11", categoria: "Obra", total: "100" }, { mes: "2026-11", categoria: null, total: "50" }, { mes: "2026-11", categoria: "Obra", total: "25" },
    ]);
    expect(s[0]).toEqual({ mes: "2026-10", total: "0.00", porCategoria: [] });
    expect(s[1]).toEqual({ mes: "2026-11", total: "175.00", porCategoria: [{ categoria: "Obra", total: "125.00" }, { categoria: "Sin categoría", total: "50.00" }] });
  });
});

describe("variacion", () => {
  it("porcentaje contra el anterior; sin anterior no hay comparación", () => {
    expect(variacion("150", "100")).toBe(50);
    expect(variacion("80", "100")).toBe(-20);
    expect(variacion("80", "0")).toBeNull();
  });
});

describe("matrizGastos", () => {
  it("cruza dónde × categoría, ordenado por total", () => {
    const m = matrizGastos([
      { destino: "West Club", unidad: "WCL", categoria: "Obra", importe: "100" },
      { destino: null, unidad: "Oficina", categoria: null, importe: "300" },
      { destino: "West Club", unidad: "WCL", categoria: "Obra", importe: "50" },
    ]);
    expect(m.filas).toEqual(["Oficina", "West Club"]);
    expect(m.columnas).toEqual(["Sin categoría", "Obra"]);
    expect(m.celda["West Club"]["Obra"]).toBe("150.00");
    expect(m.max).toBe(300);
  });
});
