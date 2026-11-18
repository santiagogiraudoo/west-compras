import { describe, expect, it } from "vitest";
import { analizarLectura, mismoNumero, numeroComprobante, tipoComprobante, type LecturaFactura } from "./lectura";

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
