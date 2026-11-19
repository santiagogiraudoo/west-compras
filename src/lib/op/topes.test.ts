import { describe, expect, it } from "vitest";
import { evaluarTope, previosEnOP, type EntradaTope } from "./topes";

const base: EntradaTope = {
  importe: "160000", acumuladoCompra: "0", acumuladoMes: "0",
  topeCompraUsd: "500", topeMesUsd: null, blue: "1600", noCruza: [],
};

describe("evaluarTope", () => {
  it("dentro del tope y cruza: se aprueba solo", () => {
    const r = evaluarTope(base); // 160.000 / 1.600 = US$ 100
    expect(r.auto).toBe(true);
    expect(r.motivo).toBe("Dentro del tope: US$ 100 de US$ 500, blue $1.600");
  });
  it("sin tope, sin cotización o si no cruza, pide firma", () => {
    expect(evaluarTope({ ...base, topeCompraUsd: null })).toEqual({ auto: false, motivo: "La unidad no tiene tope cargado" });
    expect(evaluarTope({ ...base, blue: null }).auto).toBe(false);
    expect(evaluarTope({ ...base, noCruza: ["sin remito"] })).toEqual({ auto: false, motivo: "No cruza: sin remito" });
  });
  it("no se parte una compra: suma lo del mismo proveedor y unidad", () => {
    const r = evaluarTope({ ...base, acumuladoCompra: "720000" }); // (160.000 + 720.000) / 1.600 = 550
    expect(r).toEqual({ auto: false, motivo: "Supera el tope por compra: US$ 550 de US$ 500" });
  });
  it("tope por mes", () => {
    expect(evaluarTope({ ...base, topeMesUsd: "1000", acumuladoMes: "1500000" }).auto).toBe(false); // 1.660.000 / 1.600 = 1.037,5
    expect(evaluarTope({ ...base, topeMesUsd: "1000", acumuladoMes: "1000000" }).auto).toBe(true);
  });
  it("justo en el tope pasa", () => {
    expect(evaluarTope({ ...base, importe: "800000" }).auto).toBe(true); // 500 exacto
  });
});

describe("previosEnOP", () => {
  it("suma los renglones anteriores de la misma unidad, no los de otras", () => {
    expect(previosEnOP([
      { unidad: "UN-01", importe: "900" }, { unidad: "UN-02", importe: "50" }, { unidad: "UN-01", importe: "900" }, { unidad: "UN-01", importe: "900" },
    ])).toEqual(["0.00", "0.00", "900.00", "1800.00"]);
  });
  it("con lo anterior de la OP, la tercera factura de US$ 900 ya no entra en un tope de US$ 1.000", () => {
    const previos = previosEnOP([{ unidad: "UN-01", importe: "900" }, { unidad: "UN-01", importe: "900" }]);
    const r = evaluarTope({ importe: "900", acumuladoCompra: previos[1], acumuladoMes: "0", topeCompraUsd: "1000", topeMesUsd: null, blue: "1", noCruza: [] });
    expect(r.auto).toBe(false);
  });
});
