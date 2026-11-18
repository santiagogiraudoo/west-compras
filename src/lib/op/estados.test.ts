import { describe, expect, it } from "vitest";
import { aDecidir, aQuitar, aResolver, chequeosOP, decide, diferenciaRemito, noCruzaRenglon, pendientesOP, quita, subasDePrecio, type ItemLinea } from "./estados";

const item = (precio: string | null, anterior: string | null): ItemLinea =>
  ({ descripcion: "Cemento x 50 kg", cantidad: "10", precio, anterior, anterior_fecha: "2026-10-01" });
const linea = (over: Partial<{ tipo: string; tiene_remito: boolean; archivo_link: string | null; items: ItemLinea[] | null; remito_importe: string | null }> = {}) => ({
  tipo: "Factura A", numero: "0001-00000001", tiene_remito: true, archivo_link: "https://x/f.pdf", items: null,
  remito_importe: null as string | null, factura_total: "1210.00", factura_neto: "1000.00", ...over,
});

describe("decide", () => {
  it("decide el aprobador de la unidad; sin aprobador, un admin", () => {
    expect(decide({ aprobador_id: 7 }, { id: 7, role: "operador" })).toBe(true);
    expect(decide({ aprobador_id: 7 }, { id: 1, role: "admin" })).toBe(false);
    expect(decide({ aprobador_id: null }, { id: 1, role: "admin" })).toBe(true);
    expect(decide({ aprobador_id: null }, { id: 2, role: "operador" })).toBe(false);
  });
});

describe("quita", () => {
  it("cualquier decisión (también una aprobación), por quien lo decide o un admin", () => {
    expect(quita({ aprobador_id: 7, decision: "Observada" }, { id: 7, role: "operador" })).toBe(true);
    expect(quita({ aprobador_id: 7, decision: "Bloqueada" }, { id: 1, role: "admin" })).toBe(true);
    expect(quita({ aprobador_id: 7, decision: "Aprobada" }, { id: 7, role: "operador" })).toBe(true);
    expect(quita({ aprobador_id: 7, decision: "Observada" }, { id: 8, role: "operador" })).toBe(false);
    expect(quita({ aprobador_id: null, decision: null }, { id: 1, role: "admin" })).toBe(false);
  });
});

describe("aDecidir", () => {
  const yo = { id: 7, role: "operador" };
  const ls = [
    { id: "1", unidad: "UN-01", aprobador_id: 7, decision: null },
    { id: "2", unidad: "UN-01", aprobador_id: 7, decision: "Aprobada" },
    { id: "3", unidad: "UN-01", aprobador_id: 7, decision: "Observada" },
    { id: "4", unidad: "UN-02", aprobador_id: 9, decision: null },
  ] as const;
  it("sin renglón: solo los míos sin decidir (aprobar el resto no pisa lo decidido)", () => {
    expect(aDecidir([...ls], yo).map((l) => l.id)).toEqual(["1"]);
  });
  it("una factura sola: la mía sin decidir o aprobada; la frenada primero se quita", () => {
    expect(aDecidir([...ls], yo, { id: "1", unidad: "UN-01" })).toHaveLength(1);
    expect(aDecidir([...ls], yo, { id: "2", unidad: "UN-01" })).toHaveLength(1);
    expect(aDecidir([...ls], yo, { id: "3", unidad: "UN-01" })).toHaveLength(0);
    expect(aDecidir([...ls], yo, { id: "4", unidad: "UN-02" })).toHaveLength(0);
  });
  it("aprobar una ya aprobada no agrega nada; observarla sí", () => {
    expect(aDecidir([...ls], yo, { id: "2", unidad: "UN-01" }, "Aprobada")).toHaveLength(0);
    expect(aDecidir([...ls], yo, { id: "2", unidad: "UN-01" }, "Observada")).toHaveLength(1);
  });
  it("quitar: por tipo sin renglón; con renglón, esa factura con la decisión que tenga", () => {
    expect(aQuitar([...ls], yo, "frenadas").map((l) => l.id)).toEqual(["3"]);
    expect(aQuitar([...ls], yo, "aprobadas").map((l) => l.id)).toEqual(["2"]);
    expect(aQuitar([...ls], yo, "frenadas", { id: "2", unidad: "UN-01" }).map((l) => l.id)).toEqual(["2"]);
    expect(aQuitar([...ls], yo, "frenadas", { id: "1", unidad: "UN-01" })).toHaveLength(0);
    expect(aQuitar([...ls], { id: 1, role: "admin" }, "frenadas", { id: "3", unidad: "UN-01" })).toHaveLength(1);
  });
});

describe("subasDePrecio", () => {
  it("marca lo que subió más del 5 % contra la última compra", () => {
    const s = subasDePrecio([linea({ items: [item("1100", "1000"), item("1040", "1000"), item("900", "1000"), item("50", null)] })]);
    expect(s).toHaveLength(1);
    expect(s[0].pct).toBe("10.0");
    expect(s[0].factura).toBe("Factura A 0001-00000001");
  });
});

describe("chequeosOP", () => {
  it("todo en verde", () => {
    const c = chequeosOP([linea({ items: [item("1000", "1000")] })], []);
    expect(c.every((x) => x.ok)).toBe(true);
    expect(c.find((x) => x.clave === "precio")?.texto).toBe("Precio igual o menor que la última compra");
  });
  it("amarillo lo que hay que mirar", () => {
    const c = chequeosOP(
      [linea({ tiene_remito: false, archivo_link: null, items: [item("2000", "1000")] }), linea({ tipo: "Nota de Credito A", tiene_remito: false })],
      ["CBU", "WhatsApp"],
    );
    const por = Object.fromEntries(c.map((x) => [x.clave, x]));
    expect(por.remito.ok).toBe(false);
    expect(por.remito.texto).toBe("Sin remito: 0001-00000001");
    expect(por.pdf.ok).toBe(false);
    expect(por.alta.texto).toBe("Al proveedor le falta: CBU, WhatsApp");
    expect(por.precio.texto).toBe("1 ítem más caro que la última compra");
  });
  it("sin historia de precios no es amarillo", () => {
    const c = chequeosOP([linea({ items: [item("1000", null)] })], []);
    expect(c.find((x) => x.clave === "precio")).toMatchObject({ ok: true, texto: "Precio: sin compras anteriores para comparar" });
  });
});

describe("aResolver", () => {
  const admin = { id: 1, role: "admin" };
  it("el admin resuelve lo observado o bloqueado por otro, no lo pendiente de otro ni lo suyo", () => {
    expect(aResolver({ aprobador_id: 7, decision: "Observada" }, admin)).toBe(true);
    expect(aResolver({ aprobador_id: 7, decision: "Bloqueada" }, admin)).toBe(true);
    expect(aResolver({ aprobador_id: 7, decision: null }, admin)).toBe(false);
    expect(aResolver({ aprobador_id: 7, decision: "Aprobada" }, admin)).toBe(false);
    expect(aResolver({ aprobador_id: 1, decision: "Observada" }, admin)).toBe(false);
  });
  it("solo un admin", () => {
    expect(aResolver({ aprobador_id: 7, decision: "Observada" }, { id: 3, role: "operador" })).toBe(false);
  });
});

describe("pendientesOP", () => {
  const l = (decision: "Aprobada" | "Observada" | null, aprobador = "Santiago Giraudo") =>
    ({ decision, aprobador, usuario: decision ? "Santiago Giraudo" : null, motivo: decision === "Observada" ? "falta remito" : null, importe: "100", vencimiento: "2026-11-20" });
  it("arma una línea por OP según su estado", () => {
    const p = pendientesOP([
      { numero: "OP-1", estado: "En armado", razon_social: "Defer", armada_en: "2026-11-17T10:00:00Z", enviada_en: null, lineas: [l(null)] },
      { numero: "OP-2", estado: "A aprobar", razon_social: "Sierra", enviada_en: "2026-11-15 09:00:00+00", lineas: [l("Aprobada", "Adriano"), l(null), l(null, "Adriano")] },
      { numero: "OP-3", estado: "Observada", razon_social: "Hierrosan", enviada_en: "2026-11-18", lineas: [l("Observada")] },
      { numero: "OP-4", estado: "Autorizada", razon_social: "Ferreyra", enviada_en: "2026-11-18", lineas: [l("Aprobada")] },
    ], "2026-11-18");
    expect(p.map((x) => x.detalle)).toEqual([
      "OP-1 armada hace 1 día: mandala a aprobar o descartala",
      "OP-2 esperando a Santiago Giraudo y Adriano hace 3 días",
      "OP-3: Santiago Giraudo — falta remito",
      "OP-4 vence 20/11/2026",
    ]);
    expect(p.map((x) => x.href)).toEqual(["/op", "/op?paso=aprobar", "/op?paso=aprobar", "/op?paso=pagar"]);
  });
});

describe("diferenciaRemito", () => {
  const f = (remito_importe: string | null) => ({ remito_importe, factura_total: "1210.00", factura_neto: "1000.00" });
  it("cruza con el total o con el neto, por menos de $1", () => {
    expect(diferenciaRemito(f("1210.50"))).toBeNull();
    expect(diferenciaRemito(f("999.40"))).toBeNull();
    expect(diferenciaRemito(f(null))).toBeNull();
  });
  it("tolerancia cero: $1 o más no cruza", () => {
    expect(diferenciaRemito(f("1209.00"))).toBe("remito $1.209 contra factura $1.210");
  });
});

describe("chequeos con el remito", () => {
  it("un remito que no coincide es amarillo y no cruza para el tope", () => {
    const l = linea({ remito_importe: "900.00" });
    const c = chequeosOP([l], []).find((x) => x.clave === "remito");
    expect(c).toMatchObject({ ok: false, texto: "No coincide con el remito: 0001-00000001 (remito $900 contra factura $1.210)" });
    expect(noCruzaRenglon(l)).toEqual(["no coincide con el remito (remito $900 contra factura $1.210)"]);
  });
});
