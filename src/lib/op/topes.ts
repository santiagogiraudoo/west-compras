import Decimal from "decimal.js";

/**
 * "Se aprueba una sola vez" (Adriano 17/11): un renglón que cruza (remito, PDF, precio)
 * y queda dentro del tope de su unidad no pide firma; sale aprobado solo al mandar la OP
 * a aprobar. Topes en dólar blue, promedio compra/venta, editables en Configuración.
 *
 * - Tope por compra: lo de este renglón más lo del mismo proveedor y unidad en los
 *   últimos días (no se parte una compra para quedar abajo del tope).
 * - Tope por mes: lo ya aprobado en la unidad este mes más este renglón.
 * Sin tope cargado, sin cotización o si no cruza: pide firma.
 */
export const DIAS_MISMA_COMPRA = 7;

export interface EntradaTope {
  importe: string;
  /** Mismo proveedor y unidad, en otras OP vivas, facturas de los últimos días. */
  acumuladoCompra: string;
  /** Aprobado este mes en la unidad (otras OP). */
  acumuladoMes: string;
  topeCompraUsd: string | null;
  topeMesUsd: string | null;
  /** Promedio compra/venta del blue; null si la API no respondió. */
  blue: string | null;
  /** Lo que no cruza (sin remito, sin PDF, más caro, no coincide con el remito). */
  noCruza: string[];
}

const usd = (ars: Decimal, blue: Decimal) => ars.div(blue);
const fmt = (d: Decimal) => d.toDecimalPlaces(0).toNumber().toLocaleString("es-AR");

export function evaluarTope(e: EntradaTope): { auto: boolean; motivo: string } {
  if (e.topeCompraUsd == null) return { auto: false, motivo: "La unidad no tiene tope cargado" };
  if (!e.blue) return { auto: false, motivo: "Sin cotización del dólar blue" };
  if (e.noCruza.length) return { auto: false, motivo: `No cruza: ${e.noCruza.join(", ")}` };
  const blue = new Decimal(e.blue);
  const compra = usd(new Decimal(e.importe).plus(e.acumuladoCompra), blue);
  const tope = new Decimal(e.topeCompraUsd);
  if (compra.gt(tope)) {
    return { auto: false, motivo: `Supera el tope por compra: US$ ${fmt(compra)} de US$ ${fmt(tope)}` };
  }
  if (e.topeMesUsd != null) {
    const mes = usd(new Decimal(e.importe).plus(e.acumuladoMes), blue);
    const topeMes = new Decimal(e.topeMesUsd);
    if (mes.gt(topeMes)) return { auto: false, motivo: `Supera el tope del mes: US$ ${fmt(mes)} de US$ ${fmt(topeMes)}` };
  }
  return {
    auto: true,
    motivo: `Dentro del tope: US$ ${fmt(compra)} de US$ ${fmt(tope)}${e.topeMesUsd != null ? ` (mes: tope US$ ${fmt(new Decimal(e.topeMesUsd))})` : ""}, blue $${fmt(blue)}`,
  };
}
