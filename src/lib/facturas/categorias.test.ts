import { describe, expect, it } from "vitest";
import { CATEGORIAS, categoriaSugerida } from "./categorias";

describe("CATEGORIAS", () => {
  it("es la lista de la app de alquileres con Tasas en vez de ABL, más Obra e Insumos de oficina", () => {
    expect([...CATEGORIAS].sort()).toEqual([
      "Comisiones", "Honorarios", "Insumos de oficina", "Mejoras", "Obra", "Otros", "Reparaciones", "Seguros", "Servicios", "Tasas",
    ]);
  });
});

describe("categoriaSugerida", () => {
  it("obra va a Obra, aunque sea un contratista o combustible", () => {
    expect(categoriaSugerida("UN-03", "Contratistas")).toBe("Obra");
    expect(categoriaSugerida("UN-02", "Ferretería")).toBe("Obra");
  });
  it("oficina, combustible y propiedades alquiladas", () => {
    expect(categoriaSugerida("UN-23", "Informática")).toBe("Insumos de oficina");
    expect(categoriaSugerida("UN-12", "Combustible")).toBe("Servicios");
    expect(categoriaSugerida("UN-12", "Contratistas")).toBe("Reparaciones");
  });
  it("sin unidad no sugiere", () => {
    expect(categoriaSugerida(null, "Corralón")).toBeNull();
  });
});
