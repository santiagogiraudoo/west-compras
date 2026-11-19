import { describe, expect, it } from "vitest";
import { tresPuntas, unidadDelTexto } from "./cruce";

// Las reglas de cruce (citas, importe, suma de remitos, compras) viven en la base y se prueban
// con sql/pruebas/023_conciliar.sql. Acá, lo que calcula la app.

describe("unidadDelTexto", () => {
  const unidades = [{ codigo: "UN-02", nombre: "WCL - WEST CLUB" }, { codigo: "UN-19", nombre: "SIRIA 455" }, { codigo: "UN-28", nombre: "SIRIA 339" }, { codigo: "UN-03", nombre: "ISELIN 90" }];
  it("encuentra la unidad nombrada, sin tildes ni mayúsculas", () => {
    expect(unidadDelTexto("obra West Club, retira Juan", unidades)).toBe("UN-02");
    expect(unidadDelTexto("Av. Iselin 90", unidades)).toBe("UN-03");
    expect(unidadDelTexto("Siria 455.", unidades)).toBe("UN-19");
  });
  it("si nombra dos o ninguna, no adivina", () => {
    expect(unidadDelTexto("Siria", unidades)).toBeNull();
    expect(unidadDelTexto("West Club y Siria 455", unidades)).toBeNull();
    expect(unidadDelTexto(null, unidades)).toBeNull();
  });
});

describe("tresPuntas", () => {
  it("cruza si lo facturado es lo comprado (menos de $1) y los remitos están firmados", () => {
    expect(tresPuntas("121000", "121000.50", 1, 0)).toEqual({ cruza: true, motivos: [] });
  });
  it("dice qué no cierra", () => {
    expect(tresPuntas("121000", "125000", 1, 0).motivos).toEqual(["se facturó $4000.00 más que la compra"]);
    expect(tresPuntas("121000", "100000", 0, 1).motivos).toEqual(["falta facturar $21000.00 de la compra", "ningún remito firmado", "1 remito(s) sin firmar"]);
    expect(tresPuntas(null, "1", 1, 0).cruza).toBe(false);
  });
});
