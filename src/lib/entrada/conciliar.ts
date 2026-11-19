import { cierra } from "@/lib/montos";
import { compraDelRemito, facturaDelRemito, remitosDeLaFactura, type CompraCruce, type FacturaCruce, type RemitoCruce } from "./cruce";

/**
 * El conciliador: arma la cadena compra ↔ remito ↔ factura solo, sin que nadie ate a mano.
 * Recorre todo lo abierto de un proveedor (facturas sin remito, remitos sin factura, remitos sin
 * compra), venga del Buzón, de Añadir factura o del plomero, con las reglas de cruce.ts.
 * Puro: devuelve qué hacer; lo ejecuta conciliar.server.ts con las funciones de la base.
 */

export interface EstadoProveedor {
  proveedor: string;
  /** Facturas (no NC) sin ningún remito. */
  facturasSinRemito: FacturaCruce[];
  /** Remitos sin factura. */
  remitosSinFactura: RemitoCruce[];
  /** Remitos sin compra (tengan o no factura). */
  remitosSinCompra: RemitoCruce[];
  /** Compras del proveedor (las abiertas reciben remitos). */
  compras: CompraCruce[];
}

export type AccionConciliar =
  | { tipo: "ligar_factura"; remito: string; factura: string; por: string }
  | { tipo: "atar_compra"; remito: string; compra: string; por: string }
  | { tipo: "crear_compra"; remito: string; por: string };

/**
 * Qué atar, en este orden:
 * 1. cada factura sin remito se lleva los remitos sueltos que le corresponden (cita, importe,
 *    suma de remitos), de la más vieja a la más nueva;
 * 2. cada remito que sigue suelto busca su factura (si la cita o tiene su importe);
 * 3. cada remito sin compra (desde `desdeCompras`) va a su compra abierta o crea la suya: "la
 *    compra entra con el remito o la confirmación". Lo anterior a esa fecha no tiene compras.
 * Un remito o una factura se usa una sola vez.
 */
export function planConciliar(e: EstadoProveedor, desdeCompras: string): AccionConciliar[] {
  const acciones: AccionConciliar[] = [];
  let sueltos = [...e.remitosSinFactura];
  const facturas = [...e.facturasSinRemito].sort((a, b) => a.fecha.localeCompare(b.fecha) || a.id.localeCompare(b.id));
  const usadas = new Set<string>();

  for (const f of facturas) {
    const c = remitosDeLaFactura(f, sueltos);
    if (!c) continue;
    // Por importe o por suma no se adivina: si otra factura abierta tiene el mismo total,
    // cualquiera de las dos podría ser. Las citas (número escrito) sí son seguras.
    const porMonto = c.por === "mismo importe y fecha" || c.por === "suma de remitos";
    if (porMonto && facturas.some((g) => g.id !== f.id && !usadas.has(g.id) && cierra(g.total, f.total))) continue;
    for (const r of c.remitos) acciones.push({ tipo: "ligar_factura", remito: r.id, factura: f.id, por: c.por });
    const ids = new Set(c.remitos.map((r) => r.id));
    sueltos = sueltos.filter((r) => !ids.has(r.id));
    usadas.add(f.id);
  }
  for (const r of [...sueltos]) {
    const c = facturaDelRemito(r, facturas.filter((f) => !usadas.has(f.id)));
    if (!c) continue;
    acciones.push({ tipo: "ligar_factura", remito: r.id, factura: c.factura.id, por: c.por });
    usadas.add(c.factura.id);
  }

  // Compras: una compra abierta recibe hasta cubrir su importe; lo demás crea la suya.
  const compras = e.compras.map((k) => ({ ...k }));
  for (const r of e.remitosSinCompra.filter((x) => (x.fecha ?? "") >= desdeCompras).sort((a, b) => (a.fecha ?? "").localeCompare(b.fecha ?? ""))) {
    const c = compraDelRemito(r, compras);
    if (c) {
      acciones.push({ tipo: "atar_compra", remito: r.id, compra: c.compra.id, por: c.por });
      c.compra.estado = "hecho"; // ya recibió su remito: no se lleva otro por importe
    } else {
      acciones.push({ tipo: "crear_compra", remito: r.id, por: "sin compra abierta que le corresponda" });
    }
  }
  return acciones;
}
