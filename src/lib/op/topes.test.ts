import { describe, expect, it } from "vitest";
import { evaluarTope, type EntradaTope } from "./topes";

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
