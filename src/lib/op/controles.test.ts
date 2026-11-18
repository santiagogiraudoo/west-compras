import { describe, expect, it } from "vitest";
import { problemasOP, type FacturaEnOP } from "./controles";

const f = (o: Partial<FacturaEnOP> = {}): FacturaEnOP => ({
  factura: "0001-1", estado_aprobacion: "Aprobado", total: "1000", imputado: "1000", en_clickup: null, ...o,
});

describe("problemasOP", () => {
  it("una OP sana no tiene problemas (los centavos no cuentan)", () => {
    expect(problemasOP([f(), f({ imputado: "1000.40" })])).toEqual([]);
  });
  it("frena una factura anulada después de armar la OP", () => {
    expect(problemasOP([f({ estado_aprobacion: "Anulado" })])).toEqual(["La factura 0001-1 está anulada: sacala de la OP"]);
  });
  it("frena la misma factura en una OP de ClickUp (doble pago)", () => {
    expect(problemasOP([f({ en_clickup: "OP-2026-131" })])[0]).toContain("también está en OP-2026-131");
  });
  it("frena lo imputado de más", () => {
    expect(problemasOP([f({ imputado: "1500" })])).toEqual(["A la factura 0001-1 se le imputa $500 más que su total"]);
  });
});
