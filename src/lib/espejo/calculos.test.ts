import { describe, expect, it } from "vitest";
import { evaluarEspejo, resumirEspejo, type FilaEspejo } from "./calculos";

const alta = { cuit: "30-70918981-2", cbu: "0150807702000105477080", alias: null, cuenta_titular: "Defer SA", condicion_iva: "Responsable Inscripto",
  medio_pago_habitual: "Transferencia", telefono: "5493511234567", rubro: "Corralón", condicion_pago: "30 días" };
const fila = (o: Partial<FilaEspejo> = {}): FilaEspejo => ({
  ...alta, numero: "OP-1", estado: "Pagada", origen: "plomero", fecha_op: "2026-11-10", total: "1210.00", razon_social: "Defer",
  factura_id: "10", tipo: "Factura A", factura: "00003-00000001", factura_total: "1210.00", factura_neto: "1000.00",
  archivo_link: "https://x/f.pdf", retiro_por: null, remitos: 1, remito_importe: "1210.00",
  compra: { clave: "k", nombre: "Pedido", importe: "1210.00", facturado: "1210.00", firmados: 1, sin_firmar: 0 }, ...o,
});

describe("evaluarEspejo", () => {
  it("una OP de ClickUp cuyas facturas cruzan las tres puntas: la app la habría aprobado sola", () => {
    const [op] = evaluarEspejo([fila()]);
    expect(op).toMatchObject({ numero: "OP-1", cruza: true, faltaAlta: [] });
    expect(op.facturas).toEqual([{ id: "10", numero: "00003-00000001", motivos: [] }]);
  });
  it("si una factura no cruza, la OP pide firma, con el motivo de cada factura", () => {
    const [op] = evaluarEspejo([fila(), fila({ factura_id: "11", factura: "00003-00000002", compra: null })]);
    expect(op.cruza).toBe(false);
    expect(op.facturas[1].motivos).toEqual(["sin compra"]);
  });
  it("dice lo que le falta al alta para que la app deje pagar", () => {
    expect(evaluarEspejo([fila({ cbu: null, alias: null })])[0].faltaAlta).toContain("CBU");
  });
  it("una OP de ClickUp sin facturas ligadas no se puede evaluar", () => {
    expect(evaluarEspejo([fila({ factura_id: null, tipo: null, factura: null })])[0]).toMatchObject({ cruza: false, facturas: [] });
  });
});

describe("resumirEspejo", () => {
  it("cuenta las que cruzan y agrupa los motivos por OP", () => {
    const ops = evaluarEspejo([
      fila(),
      fila({ numero: "OP-2", compra: null }),
      fila({ numero: "OP-3", compra: null, remito_importe: null }),
      fila({ numero: "OP-4", factura_id: null, tipo: null, factura: null }),
    ]);
    const r = resumirEspejo(ops);
    expect(r).toMatchObject({ total: 4, cruzan: 1, sinAlta: 0, monto: "4840.00" });
    expect(r.motivos[0]).toEqual({ motivo: "sin compra", ops: 2 });
    expect(r.motivos.map((m) => m.motivo)).toContain("sin facturas ligadas");
  });
});
