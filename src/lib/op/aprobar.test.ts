import { describe, expect, it } from "vitest";
import { enVerde } from "./aprobar";
import type { LineaAprobacion } from "./estados";

const linea = (o: Partial<LineaAprobacion> = {}): LineaAprobacion => ({
  op_numero: "OP-1", id: "1", tipo: "Factura A", numero: "00003-00000001", fecha: "2026-11-10", vencimiento: null,
  unidad: "UN-02", unidad_nombre: "West Club", importe: "1210.00", partida: false, archivo_link: "https://x/f.pdf",
  quien: null, para_que: null, tiene_remito: true, remito_importe: "1210.00", factura_total: "1210.00", factura_neto: "1000.00",
  decision: null, motivo: null, usuario: null, decidido_en: null, aprobador_id: 7, aprobador: "Santiago", items: null, remitos: null,
  compra: { clave: "k", nombre: "Pedido", importe: "1210.00", facturado: "1210.00", firmados: 1, sin_firmar: 0 }, ...o,
});
const op = (o: Partial<{ numero: string; estado: string; lineas: LineaAprobacion[] }> = {}) => ({ numero: "OP-1", estado: "A aprobar", lineas: [linea()], ...o });
const SANTIAGO = { id: 7, role: "operador" };

describe("enVerde: lo que se firma de un toque", () => {
  it("mis renglones sin decidir que cruzan las tres puntas", () => {
    const r = enVerde([op()], SANTIAGO, {});
    expect(r.map((x) => [x.op.numero, x.lineas.map((l) => l.id)])).toEqual([["OP-1", ["1"]]]);
  });
  it("no: de otro aprobador, ya decididos, sin compra, sin PDF o en una OP con frenos", () => {
    const lineas = [
      linea({ id: "otro", aprobador_id: 9 }),
      linea({ id: "decidido", decision: "Aprobada" }),
      linea({ id: "sincompra", compra: null }),
      linea({ id: "sinpdf", archivo_link: null }),
    ];
    expect(enVerde([op({ lineas })], SANTIAGO, {})).toEqual([]);
    expect(enVerde([op()], SANTIAGO, { "OP-1": ["La factura está anulada"] })).toEqual([]);
  });
  it("solo OP a aprobar (una observada se resuelve aparte)", () => {
    expect(enVerde([op({ estado: "Observada" })], SANTIAGO, {})).toEqual([]);
  });
});
