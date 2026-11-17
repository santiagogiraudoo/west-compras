import { describe, expect, it } from "vitest";
import { faltantesProveedor, requisitosFactura, type DatosFactura, type DatosProveedor } from "./requisitos";

const completa: DatosFactura = {
  tipo: "FA", unidad_codigo: "UN-03", categoria: "Obra", facturado_a: "Giraudo Hernando Esteban",
  archivo_link: "https://sharepoint/x.pdf", neto: "100000", iva: "21000", percepciones: "0",
  total: "121000", tieneRemito: true,
};
const proveedorOk: DatosProveedor = {
  cuit: "30-1", cbu: null, alias: "CORRALON.X", cuenta_titular: "Corralón X SRL", medio_pago_habitual: "Transferencia", condicion_iva: "RI", telefono: "260", rubro: "Corralón", condicion_pago: "30 días",
};

describe("requisitosFactura", () => {
  it("una factura completa no tiene nada", () => {
    expect(requisitosFactura(completa, proveedorOk)).toEqual({ faltan: [], excepciones: [], avisos: [] });
  });

  it("los datos que faltan frenan la aprobación", () => {
    const r = requisitosFactura({ ...completa, unidad_codigo: null, categoria: " ", facturado_a: null, archivo_link: null }, proveedorOk);
    expect(r.faltan).toEqual([
      "Falta la unidad de negocio", "Falta la categoría", "Falta a nombre de quién está (titular)", "Falta el PDF",
    ]);
  });

  it("la categoría frena la aprobación, pero no reabre una ya aprobada", () => {
    expect(requisitosFactura({ ...completa, categoria: null }, proveedorOk).faltan).toEqual(["Falta la categoría"]);
    expect(requisitosFactura({ ...completa, categoria: null, estado_aprobacion: "Aprobado" }, proveedorOk).faltan).toEqual([]);
  });

  it("el total que no cierra frena, pero tolera $1 de redondeo", () => {
    expect(requisitosFactura({ ...completa, total: "121000.99" }, proveedorOk).faltan).toEqual([]);
    expect(requisitosFactura({ ...completa, total: "121002" }, proveedorOk).faltan)
      .toEqual(["El total no cierra con neto + IVA + percepciones"]);
  });

  it("sin remito es excepción, no falta", () => {
    const r = requisitosFactura({ ...completa, tieneRemito: false }, proveedorOk);
    expect(r.faltan).toEqual([]);
    expect(r.excepciones).toEqual(["Sin remito ni quién recibió"]);
  });

  it("las notas de crédito y el tipo Remito no piden remito aparte", () => {
    expect(requisitosFactura({ ...completa, tipo: "Nota de Credito A", tieneRemito: false }, proveedorOk).excepciones).toEqual([]);
    expect(requisitosFactura({ ...completa, tipo: "Remito", tieneRemito: false }, proveedorOk).excepciones).toEqual([]);
  });

  it("compra sin factura no pide PDF pero siempre es excepción", () => {
    const r = requisitosFactura({ ...completa, tipo: "Sin factura", archivo_link: null }, proveedorOk);
    expect(r.faltan).toEqual([]);
    expect(r.excepciones).toContain("Compra sin factura: necesita aprobación con motivo");
  });

  it("el alta incompleta del proveedor avisa pero no frena la factura", () => {
    const r = requisitosFactura(completa, { ...proveedorOk, alias: null, telefono: "" });
    expect(r.faltan).toEqual([]);
    expect(r.avisos).toEqual(["Proveedor sin CBU", "Proveedor sin WhatsApp"]);
  });
});

describe("faltantesProveedor", () => {
  it("lista lo que le falta al alta", () => {
    expect(faltantesProveedor({ ...proveedorOk, cuit: null, condicion_pago: null })).toEqual(["CUIT", "condiciones de pago"]);
  });
  it("con cuenta pide el titular; en negro y en efectivo no pide cuenta", () => {
    expect(faltantesProveedor({ ...proveedorOk, cuenta_titular: null })).toEqual(["titular de la cuenta"]);
    expect(faltantesProveedor({ ...proveedorOk, alias: null, condicion_iva: "En negro (sin factura)", medio_pago_habitual: "Efectivo" })).toEqual([]);
    expect(faltantesProveedor({ ...proveedorOk, alias: null, medio_pago_habitual: "Efectivo" })).toEqual(["CBU"]);
  });
});
