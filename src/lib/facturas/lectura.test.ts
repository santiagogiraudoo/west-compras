import { describe, expect, it } from "vitest";
import { analizarLectura, claveComprobante, mismoNumero, numeroComprobante, tipoComprobante, type LecturaFactura } from "./lectura";

const l = (o: Partial<LecturaFactura> = {}): LecturaFactura => ({
  es_factura: true, cuit_emisor: "30-70918981-2", razon_social: "Defer", tipo: "FA", letra: "A", punto_venta: "3", numero: "45564",
  fecha: "2026-11-02", vencimiento: null, cuit_receptor: null, neto: "1000", iva: "210", percepciones: "0", total: "1210", items: [], dudas: [], ...o,
});

describe("formato de la base", () => {
  it("tipo y número como los guarda cc.comprobantes", () => {
    expect(tipoComprobante("FA", "a")).toBe("Factura A");
    expect(tipoComprobante("NC", "C")).toBe("Nota de Credito C");
    expect(numeroComprobante("3", "45564")).toBe("00003-00045564");
    expect(numeroComprobante(null, null)).toBeNull();
  });
  it("mismo número aunque el punto de venta tenga 4 o 5 dígitos", () => {
    expect(mismoNumero("0026-00002675", "00026-00002675")).toBe(true);
    expect(mismoNumero("00026-00002675", "00026-00002676")).toBe(false);
  });
});

// Los formatos que hay de verdad en cc.comprobantes (dev, 19/11). La misma tabla se corre
// contra cc._clave_comprobante en la base: las dos reglas tienen que dar lo mismo.
const CASOS_CLAVE: [string, string, string][] = [
  ["0003-00045093", "3-45093", ""],
  ["00003-00045093", "3-45093", ""],
  ["0003-00045093-A", "3-45093", "A"],
  ["00002-00000652/B", "2-652", "B"],
  ["0015-00012997 · FEEDLOT", "15-12997", "FEEDLOT"],
  ["0015-00013738 · DESC CASTROL", "15-13738", "DESCCASTROL"],
  [" 3 - 45093 ", "3-45093", ""],
  ["VEN-SN 15/10 OSB", "VEN-SN 15/10 OSB", ""],
  ["ven-sn  15/10 OSB", "VEN-SN 15/10 OSB", ""],
  ["SALDO-ANTERIOR", "SALDO-ANTERIOR", ""],
  ["LAB-123", "LAB-123", ""],
  ["REINT-26-00123", "REINT-26-00123", ""],
  ["TK-20261021-30000", "TK-20261021-30000", ""],
  ["SF-00001234-5", "SF-00001234-5", ""],
  ["123456", "123456", ""],
  ["123456-1", "123456-1", ""],
  ["00000-00474201", "0-474201", ""],
];

describe("claveComprobante (igual que cc._clave_comprobante)", () => {
  it.each(CASOS_CLAVE)("%s → %s / %s", (numero, base, sufijo) => {
    expect(claveComprobante(numero)).toEqual({ base, sufijo });
  });
});

describe("mismoNumero", () => {
  it("una factura entera es la misma que cualquiera de sus partes", () => {
    expect(mismoNumero("00003-00045093", "0003-00045093-C")).toBe(true);
    expect(mismoNumero("0015-00012997 · RIZZA", "15-12997")).toBe(true);
  });
  it("lo que no es punto de venta y número no se confunde por tener los mismos dígitos", () => {
    expect(mismoNumero("VEN-123", "LAB-123")).toBe(false);
    expect(mismoNumero("SALDO-ANTERIOR", "REINT-0-0")).toBe(false);
    expect(mismoNumero("VEN-SN 15/10 masilla", "VEN-SN 15/10 OSB")).toBe(false);
  });
  it("vacío nunca es igual a nada", () => {
    expect(mismoNumero("", "")).toBe(false);
    expect(mismoNumero("  ", "0001-00000001")).toBe(false);
  });
});

describe("analizarLectura: letra y vencimiento", () => {
  const provs = [{ codigo: "PR-004", cuit: "30709189812" }];
  it("avisa si no se leyó la letra", () => {
    expect(analizarLectura(l({ letra: null }), provs, []).avisos).toContain("No se leyó la letra (A, B o C): revisá el tipo");
  });
  it("avisa vencimiento anterior a la fecha (la IA leyó mal el año)", () => {
    expect(analizarLectura(l({ fecha: "2026-10-22", vencimiento: "2024-10-22" }), provs, []).avisos)
      .toContain("El vencimiento es anterior a la fecha: revisalo");
    expect(analizarLectura(l({ fecha: "2026-10-22", vencimiento: "2026-11-21" }), provs, []).avisos).toEqual([]);
  });
});

describe("analizarLectura", () => {
  const provs = [{ codigo: "PR-004", cuit: "30709189812" }];
  it("encuentra el proveedor por CUIT y no avisa nada si cierra", () => {
    const a = analizarLectura(l(), provs, []);
    expect(a).toMatchObject({ proveedor: "PR-004", tipo: "Factura A", numero: "00003-00045564", repetida: false, avisos: [] });
  });
  it("avisa CUIT desconocido, total que no cierra, repetida y las dudas de la IA", () => {
    expect(analizarLectura(l({ cuit_emisor: "20-11111111-1" }), provs, []).avisos[0]).toContain("no es de ningún proveedor");
    expect(analizarLectura(l({ total: "1500" }), provs, []).avisos).toContain("El total no cierra con neto + IVA + percepciones");
    const rep = analizarLectura(l(), provs, [{ proveedor: "PR-004", numero: "0003-00045564" }]);
    expect(rep.repetida).toBe(true);
    expect(analizarLectura(l({ dudas: ["fecha borrosa"] }), provs, []).avisos).toEqual(["La IA dudó: fecha borrosa"]);
  });
});
