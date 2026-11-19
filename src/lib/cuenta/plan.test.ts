import { describe, expect, it } from "vitest";
import type { Abierto } from "./calculos";
import { importeElegido, validarSeleccionOP } from "./calculos";
import { aReservar, planDePagos } from "./plan";

const HOY = "2026-11-19";
const ab = (o: Partial<Abierto>): Abierto => ({
  id: "1", proveedor_codigo: "PR-1", razon_social: "Corralón", unidad_codigo: "UN-01", facturado_a: "Doblege",
  tipo: "Factura A", numero: "0001-1", fecha: "2026-11-01", vencimiento: "2026-11-15", total: "100", libre: "100",
  en_op: "0", ops: null, deuda: "100", ...o,
});

describe("planDePagos", () => {
  it("una OP por proveedor y titular, con lo vencido y lo que vence en 7 días", () => {
    const plan = planDePagos([
      ab({ id: "a", vencimiento: "2026-11-10", libre: "1000" }),                   // vencida
      ab({ id: "b", vencimiento: "2026-11-24", libre: "500" }),                    // vence en 5 días
      ab({ id: "c", vencimiento: "2026-12-20", libre: "300" }),                    // más adelante
      ab({ id: "d", facturado_a: "Yrigoyen", vencimiento: null, libre: "200" }),   // otro titular, contado
    ], HOY);
    expect(plan.map((o) => [o.titular, o.items.map((i) => i.id), o.total, o.vencido])).toEqual([
      ["Doblege", ["a", "b"], "1500.00", "1000.00"],
      ["Yrigoyen", ["d"], "200.00", "200.00"],
    ]);
    expect(plan[0].despues).toBe(1);
  });

  it("descuenta las notas de crédito del mismo titular, en parte si sobran", () => {
    const [op] = planDePagos([
      ab({ id: "f", libre: "1000" }),
      ab({ id: "nc1", tipo: "Nota de Credito A", libre: "-300", fecha: "2026-10-01", vencimiento: null }),
      ab({ id: "nc2", tipo: "Nota de Credito A", libre: "-900", fecha: "2026-10-05", vencimiento: null }),
    ], HOY);
    expect(op.items.map((i) => [i.id, i.importe])).toEqual([["f", "1000.00"], ["nc1", "-300.00"], ["nc2", "-700.00"]]);
    expect(op.total).toBe("0.00"); // compensación
  });

  it("sin nada que venza, no sugiere OP; sin titular o sin libre, no entra", () => {
    expect(planDePagos([ab({ vencimiento: "2027-01-01" })], HOY)).toEqual([]);
    expect(planDePagos([ab({ facturado_a: null }), ab({ id: "2", libre: "0.30" })], HOY)).toEqual([]);
  });

  it("lo más vencido primero", () => {
    const plan = planDePagos([
      ab({ id: "x", proveedor_codigo: "PR-2", razon_social: "B", vencimiento: "2026-11-01", libre: "50" }),
      ab({ id: "y", proveedor_codigo: "PR-3", razon_social: "C", vencimiento: "2026-11-18", libre: "5000" }),
    ], HOY);
    expect(plan.map((o) => o.proveedor)).toEqual(["PR-3", "PR-2"]);
  });
});

describe("aReservar: lo que se manda a reservarOP da el mismo total que el plan", () => {
  it("las NC en parte van con su importe en positivo y el server llega al mismo total", () => {
    const filas = [
      ab({ id: "f", libre: "1000" }),
      ab({ id: "nc", tipo: "Nota de Credito A", libre: "-1500", vencimiento: null }),
    ];
    const [op] = planDePagos(filas, HOY);
    const r = aReservar(op);
    expect(r).toEqual({ proveedor: "PR-1", ids: ["f", "nc"], importes: { nc: "1000.00" } });
    // Lo mismo que hace el server: importeElegido + validarSeleccionOP.
    const elegidas = filas.map((a) => {
      const i = importeElegido(a.libre, a.numero, r.importes[a.id]);
      return { ...a, libre: i.ok ? i.importe : a.libre };
    });
    expect(validarSeleccionOP(elegidas)).toMatchObject({ errores: [], total: "0.00", compensacion: true });
  });
});
