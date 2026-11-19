import { describe, expect, it } from "vitest";
import { cotejarComprobante, type LecturaComprobante } from "./cotejo";

const lectura = (over: Partial<LecturaComprobante> = {}): LecturaComprobante => ({
  monto: "1000.00", fecha: "2026-11-18", referencia: "123", medio: "Transferencia",
  cuenta_destino: "0150807702000105477080", titular_destino: "Sombra Hnos", ...over,
});
const esperado = { neto: "1000.40", cbu: "0150807702000105477080", alias: "ROSA.TAPA.TEATRO" };

describe("cotejarComprobante", () => {
  it("monto y cuenta coinciden (menos de $1 de diferencia)", () => {
    expect(cotejarComprobante(lectura(), esperado).every((c) => c.ok)).toBe(true);
  });
  it("avisa si el monto no coincide", () => {
    const c = cotejarComprobante(lectura({ monto: "990.00" }), esperado);
    expect(c[0].ok).toBe(false);
    expect(c[0].texto).toMatch(/no coincide/);
  });
  it("acepta el alias o el CBU enmascarado con los últimos dígitos", () => {
    expect(cotejarComprobante(lectura({ cuenta_destino: "rosa.tapa.teatro" }), esperado)[1].ok).toBe(true);
    expect(cotejarComprobante(lectura({ cuenta_destino: "XXXX XXXX 477080" }), esperado)[1].ok).toBe(true);
  });
  it("avisa si la cuenta es otra", () => {
    expect(cotejarComprobante(lectura({ cuenta_destino: "0000003100099999999999" }), esperado)[1].ok).toBe(false);
  });
  it("sin datos leídos no afirma nada", () => {
    expect(cotejarComprobante(lectura({ monto: null, cuenta_destino: null }), esperado)).toEqual([]);
  });
});

describe("cotejarComprobante: cuenta de destino (análisis 19/11)", () => {
  it("no da por buena una cuenta cuyos 6 dígitos aparecen en el medio del CBU", () => {
    // "807702" está adentro del CBU del proveedor, pero la cuenta termina distinto.
    expect(cotejarComprobante(lectura({ cuenta_destino: "9999999999999999807702" }), esperado)[1].ok).toBe(false);
  });
  it("un alias con números no se toma por CBU", () => {
    expect(cotejarComprobante(lectura({ cuenta_destino: "PEREZ.477080" }), esperado)[1].ok).toBe(false);
  });
  it("acepta el CBU enmascarado con solo 4 dígitos", () => {
    expect(cotejarComprobante(lectura({ cuenta_destino: "***7080" }), esperado)[1].ok).toBe(true);
  });
});
