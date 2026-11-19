import { describe, expect, it } from "vitest";
import { compraDelRemito, remitosDeLaCompra, tresPuntas, unidadDelTexto, type CompraCruce, type RemitoCruce } from "./cruce";

const r = (o: Partial<RemitoCruce> = {}): RemitoCruce => ({ id: "r1", numero: "0001-00011778", fecha: "2026-11-08", importe: null, facturas_citadas: [], ...o });
const k = (o: Partial<CompraCruce> = {}): CompraCruce => ({ id: "k1", clave: "app:1", numero: "0002-00000450", fecha: "2026-11-01", importe: "121000", estado: "pedido confirmado", ...o });

describe("compraDelRemito", () => {
  it("el remito cita el pedido", () => {
    expect(compraDelRemito(r({ facturas_citadas: ["2-450"] }), [k(), k({ id: "k2", numero: "0002-00000451" })])?.compra.id).toBe("k1");
  });
  it("único con el mismo importe, de antes del remito", () => {
    expect(compraDelRemito(r({ importe: "121.000,00" }), [k({ numero: null }), k({ id: "k2", numero: null, importe: "5000" })])?.por).toBe("mismo importe");
    expect(compraDelRemito(r({ importe: "121000", fecha: "2026-10-01" }), [k({ numero: null })])).toBeNull(); // la compra es posterior
    expect(compraDelRemito(r({ importe: "121000" }), [k({ numero: null }), k({ id: "k2", numero: null })])).toBeNull(); // dos iguales
  });
  it("una compra ya entregada no recibe más remitos", () => {
    expect(compraDelRemito(r({ facturas_citadas: ["2-450"] }), [k({ estado: "hecho" })])).toBeNull();
  });
});

describe("remitosDeLaCompra", () => {
  it("entregas parciales que suman la compra", () => {
    const rs = [r({ id: "a", importe: "50000", fecha: "2026-11-03" }), r({ id: "b", importe: "71000", fecha: "2026-11-05" }), r({ id: "c", importe: "999", fecha: "2026-11-06" })];
    expect(remitosDeLaCompra(k({ numero: null }), rs).map((x) => x.id).sort()).toEqual(["a", "b"]);
  });
  it("los que citan el pedido, y sin importe ni cita nada", () => {
    expect(remitosDeLaCompra(k(), [r({ id: "a", facturas_citadas: ["00002-00000450"] }), r({ id: "b" })]).map((x) => x.id)).toEqual(["a"]);
    expect(remitosDeLaCompra(k({ numero: null, importe: null }), [r({ importe: "121000" })])).toEqual([]);
  });
});

describe("unidadDelTexto", () => {
  const unidades = [{ codigo: "UN-02", nombre: "WCL - WEST CLUB" }, { codigo: "UN-19", nombre: "SIRIA 455" }, { codigo: "UN-28", nombre: "SIRIA 339" }, { codigo: "UN-03", nombre: "ISELIN 90" }];
  it("encuentra la unidad nombrada, sin tildes ni mayúsculas", () => {
    expect(unidadDelTexto("obra West Club, retira Juan", unidades)).toBe("UN-02");
    expect(unidadDelTexto("Av. Iselin 90", unidades)).toBe("UN-03");
    expect(unidadDelTexto("Siria 455.", unidades)).toBe("UN-19");
  });
  it("si nombra dos o ninguna, no adivina", () => {
    expect(unidadDelTexto("Siria", unidades)).toBeNull();
    expect(unidadDelTexto("West Club y Siria 455", unidades)).toBeNull();
    expect(unidadDelTexto(null, unidades)).toBeNull();
  });
});

describe("tresPuntas", () => {
  it("cruza si lo facturado es lo comprado (menos de $1) y los remitos están firmados", () => {
    expect(tresPuntas("121000", "121000.50", 1, 0)).toEqual({ cruza: true, motivos: [] });
  });
  it("dice qué no cierra", () => {
    expect(tresPuntas("121000", "125000", 1, 0).motivos).toEqual(["se facturó $4000.00 más que la compra"]);
    expect(tresPuntas("121000", "100000", 0, 1).motivos).toEqual(["falta facturar $21000.00 de la compra", "ningún remito firmado", "1 remito(s) sin firmar"]);
    expect(tresPuntas(null, "1", 1, 0).cruza).toBe(false);
  });
});
