import { describe, expect, it } from "vitest";
import { calcularPago, medioSugerido, vencimientoOP, type DatosPago } from "./pago";

const l = (importe: string, _d: null, vencimiento: string | null = null) => ({ importe, vencimiento });

describe("vencimientoOP", () => {
  it("el más próximo de las líneas vivas", () => {
    expect(vencimientoOP([l("1", null, "2026-11-20"), l("1", null, "2026-11-10"), l("0", null, "2026-11-01")])).toBe("2026-11-10");
    expect(vencimientoOP([l("1", null)])).toBeNull();
  });
});

const base: DatosPago = {
  fecha: "2026-11-18", medio: "Transferencia", referencia: "TRF 123", comprobante: "",
  retenciones: { ganancias: "", iva: "", iibb: "1842.76", suss: "", otras: "" },
};

describe("calcularPago", () => {
  it("neto = total − retenciones, vacío cuenta como 0", () => {
    const r = calcularPago("51842.76", base, "2026-11-18");
    expect(r.errores).toEqual([]);
    expect(r.totalRetenciones).toBe("1842.76");
    expect(r.neto).toBe("50000.00");
    expect(r.retenciones.iibb).toBe("1842.76");
    expect(r.retenciones.ganancias).toBe("0.00");
  });
  it("pide referencia salvo efectivo o compensación", () => {
    expect(calcularPago("100", { ...base, referencia: "" }, "2026-11-18").errores).toContain("Falta la referencia bancaria");
    expect(calcularPago("100", { ...base, medio: "Efectivo", referencia: "", retenciones: { ...base.retenciones, iibb: "" } }, "2026-11-18").errores).toEqual([]);
  });
  it("rechaza retenciones de más, fecha futura, medio inválido y link raro", () => {
    const r = calcularPago("100", { ...base, fecha: "2026-11-19", medio: "Bitcoin", comprobante: "c:/x.pdf" }, "2026-11-18");
    expect(r.errores).toEqual([
      "Las retenciones superan el total de la OP",
      "La fecha de pago no puede ser futura",
      "Elegí el medio de pago",
      "El comprobante tiene que ser un link",
    ]);
  });
  it("monto que no es número", () => {
    expect(calcularPago("100", { ...base, retenciones: { ...base.retenciones, iibb: "abc" } }, "2026-11-18").errores)
      .toContain("Retención IIBB: monto inválido");
  });
});

describe("medioSugerido", () => {
  it("toma el habitual si la base lo acepta", () => {
    expect(medioSugerido("Transferencia bancaria")).toBe("Transferencia");
    expect(medioSugerido("echeq a 30 días")).toBe("Echeq");
    expect(medioSugerido("Mercado Pago")).toBe("");
    expect(medioSugerido(null)).toBe("");
  });
});

describe("calcularPago: montos raros (análisis 19/11)", () => {
  it.each(["NaN", "Infinity", "1,234.56", "abc"])("rechaza la retención %j en vez de dejar el neto en NaN", (v) => {
    const r = calcularPago("1000", { ...base, retenciones: { ...base.retenciones, ganancias: v } }, "2026-11-18");
    expect(r.errores).toContain("Retención Ganancias: monto inválido");
    expect(r.neto).not.toMatch(/NaN/);
  });
  it("acepta la retención escrita a la argentina", () => {
    expect(calcularPago("51842.76", { ...base, retenciones: { ...base.retenciones, iibb: "1.842,76" } }, "2026-11-18").neto).toBe("50000.00");
  });
});

describe("calcularPago: compensación (NC contra facturas)", () => {
  it("una OP en $0 se registra como compensación, sin referencia", () => {
    const comp = { ...base, medio: "Compensacion", referencia: "", retenciones: { ...base.retenciones, iibb: "" } };
    expect(calcularPago("0", comp, "2026-11-18")).toMatchObject({ errores: [], neto: "0.00" });
    expect(calcularPago("0", { ...comp, medio: "Transferencia", referencia: "TRF 1" }, "2026-11-18").errores)
      .toContain("Una OP en $0 es una compensación: elegí Compensación como medio");
  });
});
