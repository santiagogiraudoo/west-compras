import Decimal from "decimal.js";
import { MARGEN_LIBRE } from "@/lib/montos";
import { sumarDias, type Abierto } from "./calculos";

/**
 * Plan de pagos (fase 2, más simple que ClickUp): de todo lo aprobado y libre, las OP que hay que
 * armar ya. Una por proveedor y titular (una OP no cruza cuentas), con lo vencido y lo que vence
 * en los próximos días, y las notas de crédito del mismo titular descontadas solas (hasta cubrir
 * las facturas: si cubren todo, la OP es una compensación en $0). Puro.
 */

export interface ItemPlan {
  id: string;
  tipo: string;
  numero: string;
  vencimiento: string | null;
  /** Lo que va en la OP (negativo si es una NC); puede ser parte de lo libre. */
  importe: string;
  /** Lo libre completo: si importe es menor, es una NC aplicada en parte. */
  libre: string;
}

export interface OPSugerida {
  clave: string;
  proveedor: string;
  razon_social: string;
  titular: string;
  items: ItemPlan[];
  total: string;
  /** Lo vencido a hoy, de las facturas de la OP. */
  vencido: string;
  /** El vencimiento más próximo (o el más viejo, si ya venció). */
  vence: string | null;
  /** Facturas del mismo proveedor y titular que vencen más adelante (no van). */
  despues: number;
}

const MARGEN = new Decimal(MARGEN_LIBRE);

export function planDePagos(abiertos: Abierto[], hoy: string, dias = 7): OPSugerida[] {
  const hasta = sumarDias(hoy, dias);
  const grupos = new Map<string, Abierto[]>();
  for (const a of abiertos) {
    if (!a.facturado_a || new Decimal(a.libre).abs().lte(MARGEN)) continue;
    const clave = `${a.proveedor_codigo}|${a.facturado_a}`;
    (grupos.get(clave) ?? grupos.set(clave, []).get(clave)!).push(a);
  }
  const out: OPSugerida[] = [];
  for (const [clave, filas] of grupos) {
    const facturas = filas.filter((a) => new Decimal(a.libre).isPositive());
    // Sin vencimiento es contado: vence el día que se emite, o sea ya.
    const van = facturas.filter((a) => !a.vencimiento || a.vencimiento <= hasta)
      .sort((x, y) => (x.vencimiento ?? x.fecha).localeCompare(y.vencimiento ?? y.fecha));
    if (!van.length) continue;
    const bruto = van.reduce((t, a) => t.plus(a.libre), new Decimal(0));
    const items: ItemPlan[] = van.map((a) => ({ id: a.id, tipo: a.tipo, numero: a.numero, vencimiento: a.vencimiento, importe: new Decimal(a.libre).toFixed(2), libre: a.libre }));
    // Notas de crédito del mismo titular, la más vieja primero, hasta cubrir las facturas.
    let resta = bruto;
    for (const nc of filas.filter((a) => new Decimal(a.libre).isNegative()).sort((x, y) => x.fecha.localeCompare(y.fecha))) {
      if (resta.lte(MARGEN)) break;
      const aplica = Decimal.min(new Decimal(nc.libre).abs(), resta);
      items.push({ id: nc.id, tipo: nc.tipo, numero: nc.numero, vencimiento: nc.vencimiento, importe: aplica.neg().toFixed(2), libre: nc.libre });
      resta = resta.minus(aplica);
    }
    const vencidas = van.filter((a) => (a.vencimiento ?? a.fecha) < hoy);
    out.push({
      clave, proveedor: filas[0].proveedor_codigo, razon_social: filas[0].razon_social, titular: filas[0].facturado_a!,
      items, total: resta.toFixed(2),
      vencido: vencidas.reduce((t, a) => t.plus(a.libre), new Decimal(0)).toFixed(2),
      vence: van[0].vencimiento ?? van[0].fecha,
      despues: facturas.length - van.length,
    });
  }
  // Lo más vencido arriba; a igual vencido, la que vence primero.
  return out.sort((a, b) => new Decimal(b.vencido).comparedTo(a.vencido) || (a.vence ?? "").localeCompare(b.vence ?? ""));
}

/** Lo que reservarOP necesita de una OP sugerida: ids y, si una NC va en parte, su importe. */
export function aReservar(op: OPSugerida): { proveedor: string; ids: string[]; importes: Record<string, string> } {
  const importes: Record<string, string> = {};
  for (const i of op.items) {
    // Escrito en positivo: importeElegido lo vuelve negativo si es una NC.
    if (!new Decimal(i.importe).eq(i.libre)) importes[i.id] = new Decimal(i.importe).abs().toFixed(2);
  }
  return { proveedor: op.proveedor, ids: op.items.map((i) => i.id), importes };
}
