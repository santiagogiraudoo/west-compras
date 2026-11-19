import { describe, expect, it } from "vitest";
import { numeroSinFactura, validarExtra, type DatosExtra } from "./extraordinaria";
import { leerMonto } from "@/lib/montos";

describe("numeroSinFactura", () => {
  it("el siguiente libre del día", () => {
    expect(numeroSinFactura("2026-11-18", [])).toBe("SF-20261118-1");
    expect(numeroSinFactura("2026-11-18", ["SF-20261118-1", "SF-20261118-3", "SF-20261014-9"])).toBe("SF-20261118-4");
  });
});

describe("leerMonto (desde extraordinaria)", () => {
  it("entiende el formato argentino y el de punto decimal", () => {
    expect(leerMonto("1.234.567,89")).toBe("1234567.89");
    expect(leerMonto("1500.5")).toBe("1500.50");
    expect(leerMonto("250000")).toBe("250000.00");
    // Sin coma, puntos en grupos de tres son miles: "12.500" no es doce coma cinco.
    expect(leerMonto("12.500")).toBe("12500.00");
    expect(leerMonto("$ 1.250.000")).toBe("1250000.00");
    expect(leerMonto("1.5")).toBe("1.50");
  });
});

describe("validarExtra", () => {
  const ok: DatosExtra = {
    tipo: "Sin factura", proveedor: "PR-001", unidad: "UN-03", facturadoA: "Giraudo Hernando Esteban", fecha: "2026-11-18",
    total: "150.000", numero: "", concepto: "Maíz a granel", motivo: "El productor no factura: se paga contra pesada",
  };
  it("una compra sin factura completa no tiene errores", () => {
    expect(validarExtra(ok, "2026-11-18")).toEqual({});
  });
  it("pide motivo, concepto, importe positivo y fecha no futura; el remito necesita su número", () => {
    const e = validarExtra({ ...ok, tipo: "Remito", total: "0", fecha: "2026-12-01", concepto: "x", motivo: "corto" }, "2026-11-18");
    expect(Object.keys(e).sort()).toEqual(["concepto", "fecha", "motivo", "numero", "total"]);
  });
});
