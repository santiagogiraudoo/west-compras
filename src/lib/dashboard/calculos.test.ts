import { describe, expect, it } from "vitest";
import { antiguedad, ranking, serieMensual, ultimosMeses } from "./calculos";

describe("ultimosMeses", () => {
  it("cuenta hacia atrás cruzando el año", () => {
    expect(ultimosMeses("2026-02-10", 4)).toEqual(["2025-11", "2025-12", "2026-01", "2026-02"]);
  });
});

describe("serieMensual", () => {
  it("rellena con cero los meses sin movimiento", () => {
    const s = serieMensual(["2026-10", "2026-11"], [{ mes: "2026-11", total: "100" }], [{ mes: "2026-10", total: "40.5" }]);
    expect(s).toEqual([
      { mes: "2026-10", comprado: "0.00", pagado: "40.50" },
      { mes: "2026-11", comprado: "100.00", pagado: "0.00" },
    ]);
  });
});

describe("antiguedad", () => {
  it("reparte por días de vencida; sin vencimiento va al día y la NC resta", () => {
    const t = antiguedad([
      { vencimiento: "2026-11-20", deuda: "100" },
      { vencimiento: null, deuda: "50" },
      { vencimiento: "2026-11-01", deuda: "200" },
      { vencimiento: "2026-11-02", deuda: "-20" },
      { vencimiento: "2026-07-01", deuda: "300" },
    ], "2026-11-18");
    expect(t.map((x) => [x.tramo, x.monto, x.facturas])).toEqual([
      ["Al día", "150.00", 2], ["1–30 días", "180.00", 2], ["31–60 días", "0.00", 0], ["61–90 días", "0.00", 0], ["+90 días", "300.00", 1],
    ]);
  });
});

describe("ranking", () => {
  it("ordena de mayor a menor y junta el resto en Otros", () => {
    expect(ranking([
      { clave: "A", total: "10" }, { clave: "B", total: "30" }, { clave: "A", total: "25" }, { clave: null, total: "5" }, { clave: "C", total: "1" },
    ], 2)).toEqual([{ clave: "A", total: "35.00" }, { clave: "B", total: "30.00" }, { clave: "Otros", total: "6.00" }]);
  });
});
