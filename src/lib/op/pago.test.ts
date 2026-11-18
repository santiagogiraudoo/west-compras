import { describe, expect, it } from "vitest";
import { calcularPago, estadoAprobacion, medioSugerido, vencimientoOP, type DatosPago } from "./pago";

const l = (importe: string, decision: "Aprobada" | "Observada" | null, vencimiento: string | null = null) =>
  ({ importe, decision, vencimiento });

describe("estadoAprobacion", () => {
  it("sin decisiones está a aprobar", () => {
    expect(estadoAprobacion([l("100", null), l("50", "Aprobada")])).toBe("A aprobar");
  });
  it("una línea observada frena toda la OP", () => {
    expect(estadoAprobacion([l("100", "Aprobada"), l("50", "Observada")])).toBe("Observada");
  });
  it("todas aprobadas: autorizada; las líneas en 0 no cuentan", () => {
    expect(estadoAprobacion([l("100", "Aprobada"), l("0", null)])).toBe("Autorizada");
  });
  it("sin líneas vivas no se autoriza", () => {
    expect(estadoAprobacion([l("0", null)])).toBe("A aprobar");
  });
});

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
