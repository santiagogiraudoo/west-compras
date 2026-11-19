import { describe, expect, it } from "vitest";
import { planConciliar, type EstadoProveedor } from "./conciliar";
import type { CompraCruce, FacturaCruce, RemitoCruce } from "./cruce";

const f = (o: Partial<FacturaCruce> = {}): FacturaCruce => ({ id: "f1", numero: "00003-00008897", fecha: "2026-11-10", total: "121000", descripcion: null, ...o });
const r = (o: Partial<RemitoCruce> = {}): RemitoCruce => ({ id: "r1", numero: "0001-00011778", fecha: "2026-11-08", importe: null, facturas_citadas: [], ...o });
const k = (o: Partial<CompraCruce> = {}): CompraCruce => ({ id: "k1", clave: "app:1", numero: null, fecha: "2026-11-01", importe: "121000", estado: "pedido confirmado", ...o });
const estado = (o: Partial<EstadoProveedor> = {}): EstadoProveedor => ({ proveedor: "PR-1", facturasSinRemito: [], remitosSinFactura: [], remitosSinCompra: [], compras: [], ...o });
const DESDE = "2026-11-01";

describe("planConciliar", () => {
  it("cadena entera: remito a su factura y a su compra", () => {
    const rem = r({ importe: "121000" });
    const plan = planConciliar(estado({ facturasSinRemito: [f()], remitosSinFactura: [rem], remitosSinCompra: [rem], compras: [k()] }), DESDE);
    expect(plan).toEqual([
      { tipo: "ligar_factura", remito: "r1", factura: "f1", por: "mismo importe y fecha" },
      { tipo: "atar_compra", remito: "r1", compra: "k1", por: "mismo importe" },
    ]);
  });
  it("factura de remitos: la factura se lleva los que la suman", () => {
    const rs = [r({ id: "a", importe: "50000", fecha: "2026-10-20" }), r({ id: "b", importe: "71000", fecha: "2026-10-25" })];
    const plan = planConciliar(estado({ facturasSinRemito: [f()], remitosSinFactura: rs }), DESDE);
    expect(plan.map((x) => x.tipo === "ligar_factura" && `${x.remito}->${x.factura}`)).toEqual(["a->f1", "b->f1"]);
  });
  it("un remito no va a dos facturas ni una factura recibe dos remitos por importe", () => {
    const rem = r({ importe: "121000" });
    const plan = planConciliar(estado({ facturasSinRemito: [f(), f({ id: "f2", fecha: "2026-11-11" })], remitosSinFactura: [rem] }), DESDE);
    // Dos facturas del mismo importe: no se adivina.
    expect(plan).toEqual([]);
  });
  it("sin compra abierta, el remito crea la suya; antes del corte, no se inventan compras", () => {
    const plan = planConciliar(estado({ remitosSinCompra: [r({ id: "nuevo" }), r({ id: "viejo", fecha: "2026-09-01" })] }), DESDE);
    expect(plan).toEqual([{ tipo: "crear_compra", remito: "nuevo", por: "sin compra abierta que le corresponda" }]);
  });
  it("una compra abierta recibe un remito por importe y el segundo igual crea la suya", () => {
    const rs = [r({ id: "a", importe: "121000", fecha: "2026-11-05" }), r({ id: "b", importe: "121000", fecha: "2026-11-06" })];
    const plan = planConciliar(estado({ remitosSinCompra: rs, compras: [k()] }), DESDE);
    expect(plan.map((x) => x.tipo)).toEqual(["atar_compra", "crear_compra"]);
  });
});
