import { describe, expect, it } from "vitest";
import type { LecturaFactura } from "@/lib/facturas/lectura";
import { decidirEntrada, identificarProveedor, titularPorCuit, type Contexto, type LecturaEntrada } from "./decidir";

const factura = (o: Partial<LecturaFactura> = {}): LecturaFactura => ({
  es_factura: true, cuit_emisor: "30-70918981-2", razon_social: "Defer", tipo: "FA", letra: "A", punto_venta: "3", numero: "45564",
  fecha: "2026-11-10", vencimiento: null, cuit_receptor: "30-71871374-5", neto: "1000", iva: "210", percepciones: "0", total: "1210",
  items: [], dudas: [], ...o,
});
const entrada = (o: Partial<LecturaEntrada> = {}): LecturaEntrada => ({
  clase: "factura", cuit_emisor: "30-70918981-2", razon_social: "Defer", factura: factura(), remito: null, dudas: [], ...o,
});
const ctx = (o: Partial<Contexto> = {}): Contexto => ({
  proveedores: [{ codigo: "PR-004", cuit: "30-70918981-2", telefono: "0351 15 123-4567" }],
  titulares: [{ nombre: "Yrigoyen Developer S.A.S.", cuit: "30-71871374-5" }],
  existentes: [], remitente: null, hoy: "2026-11-19", ...o,
});

describe("identificarProveedor", () => {
  it("por CUIT, con o sin guiones", () => {
    expect(identificarProveedor("30709189812", ctx())).toEqual({ codigo: "PR-004", por: "cuit" });
  });
  it("sin CUIT, por el teléfono de quien lo mandó (cualquier formato)", () => {
    expect(identificarProveedor(null, ctx({ remitente: "5493511234567" }))).toEqual({ codigo: "PR-004", por: "telefono" });
  });
  it("CUIT mal leído no se adivina por teléfono", () => {
    const x = identificarProveedor("30-70918981-3", ctx({ remitente: "5493511234567" }));
    expect(x.codigo).toBeNull();
  });
  it("CUIT válido desconocido: dar de alta", () => {
    const x = identificarProveedor("20-11111111-2", ctx());
    expect("motivo" in x && x.motivo).toMatch(/dalo de alta/);
  });
});

describe("titularPorCuit", () => {
  it("el titular de la lista por CUIT del receptor", () => {
    expect(titularPorCuit("30718713745", ctx().titulares)).toBe("Yrigoyen Developer S.A.S.");
    expect(titularPorCuit(null, ctx().titulares)).toBeNull();
  });
});

describe("decidirEntrada", () => {
  it("factura nueva y sana: cargar, con titular por CUIT del receptor y número de la base", () => {
    expect(decidirEntrada(entrada(), ctx())).toEqual({
      tipo: "cargar_factura", proveedor: "PR-004", titular: "Yrigoyen Developer S.A.S.", numero: "00003-00045564", avisos: [],
    });
  });
  it("repetida (escrita con otro ancho) → duplicado", () => {
    const d = decidirEntrada(entrada(), ctx({ existentes: [{ proveedor: "PR-004", numero: "0003-00045564" }] }));
    expect(d.tipo).toBe("duplicado");
  });
  it("lo que falta para cargar → revisar con el motivo", () => {
    expect(decidirEntrada(entrada({ factura: factura({ numero: null }) }), ctx())).toMatchObject({ tipo: "revisar", motivo: /número/ });
    expect(decidirEntrada(entrada({ factura: factura({ total: null }) }), ctx())).toMatchObject({ tipo: "revisar", motivo: /total/ });
    expect(decidirEntrada(entrada({ cuit_emisor: "20-11111111-2" }), ctx())).toMatchObject({ tipo: "revisar", proveedor: null });
  });
  it("lo dudoso se carga igual, con sus avisos (va a ⚠️ revisar)", () => {
    const d = decidirEntrada(entrada({ factura: factura({ moneda: "DOL", dudas: ["fecha borrosa"] }) }), ctx());
    expect(d.tipo).toBe("cargar_factura");
    expect(d.tipo === "cargar_factura" && d.avisos.join()).toMatch(/no son pesos.*fecha borrosa/);
  });
  it("remito: se carga y avisa si no tiene número o firma", () => {
    const remito = { numero: null, fecha: "2026-11-10", facturas_citadas: [], retira: null, autoriza: null, destino: null, importe: null, firmado: false };
    const d = decidirEntrada(entrada({ clase: "remito", factura: null, remito }), ctx());
    expect(d).toMatchObject({ tipo: "cargar_remito", proveedor: "PR-004" });
    expect(d.tipo === "cargar_remito" && d.avisos).toEqual(["Remito sin número", "Remito sin firma de quien recibió"]);
  });
  it("comprobante de pago no se carga solo; otro se descarta", () => {
    expect(decidirEntrada(entrada({ clase: "comprobante_pago", factura: null }), ctx()).tipo).toBe("comprobante_pago");
    expect(decidirEntrada(entrada({ clase: "otro", factura: null }), ctx()).tipo).toBe("descartar");
  });
});
