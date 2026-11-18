import { describe, expect, it } from "vitest";
import { chequeosOP, decide, pendientesOP, puedeDecidir, subasDePrecio, type ItemLinea } from "./estados";

const item = (precio: string | null, anterior: string | null): ItemLinea =>
  ({ descripcion: "Cemento x 50 kg", cantidad: "10", precio, anterior, anterior_fecha: "2026-10-01" });
const linea = (over: Partial<{ tipo: string; tiene_remito: boolean; archivo_link: string | null; items: ItemLinea[] | null }> = {}) => ({
  tipo: "Factura A", numero: "0001-00000001", tiene_remito: true, archivo_link: "https://x/f.pdf", items: null, ...over,
});

describe("decide", () => {
  it("decide el aprobador de la unidad; sin aprobador, un admin", () => {
    expect(decide({ aprobador_id: 7 }, { id: 7, role: "operador" })).toBe(true);
    expect(decide({ aprobador_id: 7 }, { id: 1, role: "admin" })).toBe(false);
    expect(decide({ aprobador_id: null }, { id: 1, role: "admin" })).toBe(true);
    expect(decide({ aprobador_id: null }, { id: 2, role: "operador" })).toBe(false);
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

describe("puedeDecidir", () => {
  const admin = { id: 1, role: "admin" };
  it("el admin resuelve lo observado o bloqueado por otro, no lo pendiente de otro", () => {
    expect(puedeDecidir({ aprobador_id: 7, decision: "Observada" }, admin)).toBe(true);
    expect(puedeDecidir({ aprobador_id: 7, decision: "Bloqueada" }, admin)).toBe(true);
    expect(puedeDecidir({ aprobador_id: 7, decision: null }, admin)).toBe(false);
    expect(puedeDecidir({ aprobador_id: 7, decision: "Aprobada" }, admin)).toBe(false);
  });
  it("consulta no decide nada", () => {
    expect(puedeDecidir({ aprobador_id: 3, decision: null }, { id: 3, role: "consulta" })).toBe(false);
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
    expect(p.map((x) => x.href)).toEqual(["/op", "/aprobar", "/aprobar", "/pagos"]);
  });
});
