import Decimal from "decimal.js";
import { faltantesProveedor, type DatosProveedor } from "@/lib/facturas/requisitos";
import { noCruzaRenglon, type CompraLinea } from "@/lib/op/estados";

/**
 * Modo espejo (docs/proyecto/11_espejo.md): ClickUp sigue operando y la app mira lo mismo con
 * sus reglas. Para cada OP real de ClickUp dice qué habría hecho la app: si sus facturas
 * cruzan compra, remito y factura (aprobar una sola vez) y si el proveedor tiene el alta
 * completa para pagar. Puro: recibe filas ya leídas.
 */

export interface FilaEspejo extends DatosProveedor {
  numero: string;
  estado: string;
  origen: string;
  fecha_op: string;
  total: string;
  razon_social: string;
  factura_id: string | null;
  tipo: string | null;
  factura: string | null;
  factura_total: string | null;
  factura_neto: string | null;
  archivo_link: string | null;
  retiro_por: string | null;
  remitos: number;
  remito_importe: string | null;
  compra: CompraLinea | null;
}

export interface OPEspejo {
  numero: string;
  estado: string;
  origen: string;
  fecha: string;
  total: string;
  proveedor: string;
  facturas: { id: string; numero: string; motivos: string[] }[];
  /** Todas sus facturas cruzan: con tope cargado, la app la habría aprobado sola. */
  cruza: boolean;
  /** Lo que le falta al alta del proveedor para que la app deje pagar. */
  faltaAlta: string[];
}

export function evaluarEspejo(filas: FilaEspejo[]): OPEspejo[] {
  const porOP = new Map<string, OPEspejo>();
  for (const f of filas) {
    let op = porOP.get(f.numero);
    if (!op) {
      op = { numero: f.numero, estado: f.estado, origen: f.origen, fecha: f.fecha_op, total: f.total, proveedor: f.razon_social,
        facturas: [], cruza: true, faltaAlta: faltantesProveedor(f) };
      porOP.set(f.numero, op);
    }
    if (!f.factura_id || !f.tipo || !f.factura) continue;
    const motivos = noCruzaRenglon({
      tipo: f.tipo, numero: f.factura, items: null, archivo_link: f.archivo_link,
      tiene_remito: f.remitos > 0 || !!f.retiro_por, remito_importe: f.remito_importe,
      factura_total: f.factura_total ?? "0", factura_neto: f.factura_neto ?? "0", compra: f.compra,
    });
    op.facturas.push({ id: f.factura_id, numero: f.factura, motivos });
    if (motivos.length) op.cruza = false;
  }
  // Una OP sin facturas a la vista (ClickUp no la ligó) no se puede evaluar: no cruza.
  for (const op of porOP.values()) if (op.facturas.length === 0) op.cruza = false;
  return [...porOP.values()];
}

/** Cuántas cruzarían y por qué no las demás, de lo más frecuente a lo menos. */
export function resumirEspejo(ops: OPEspejo[]): { total: number; cruzan: number; sinAlta: number; motivos: { motivo: string; ops: number }[]; monto: string } {
  const motivos = new Map<string, Set<string>>();
  for (const op of ops) {
    if (op.facturas.length === 0) (motivos.get("sin facturas ligadas") ?? motivos.set("sin facturas ligadas", new Set()).get("sin facturas ligadas")!).add(op.numero);
    for (const f of op.facturas) for (const m of f.motivos) {
      const clave = m.replace(/\(.*\)$/, "").replace(/\$[\d.,]+/g, "$…").trim();
      (motivos.get(clave) ?? motivos.set(clave, new Set()).get(clave)!).add(op.numero);
    }
  }
  return {
    total: ops.length,
    cruzan: ops.filter((o) => o.cruza).length,
    sinAlta: ops.filter((o) => o.faltaAlta.length > 0).length,
    motivos: [...motivos].map(([motivo, s]) => ({ motivo, ops: s.size })).sort((a, b) => b.ops - a.ops),
    monto: ops.reduce((t, o) => t.plus(o.total), new Decimal(0)).toFixed(2),
  };
}
