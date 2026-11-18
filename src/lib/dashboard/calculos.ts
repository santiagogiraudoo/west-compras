import Decimal from "decimal.js";
import { diasEntre } from "@/lib/op/estados";
import type { Abierto } from "@/lib/cuenta/calculos";

/**
 * Cuentas del Dashboard, sin base: reciben filas ya leídas y devuelven números en texto
 * (decimal.js adentro). Mismo criterio de deuda que el resto de la app (Abierto.deuda).
 */

export interface MesCompra {
  /** YYYY-MM */
  mes: string;
  comprado: string;
  pagado: string;
}

/** Los últimos `n` meses hasta `hoy` (YYYY-MM), del más viejo al actual. */
export function ultimosMeses(hoy: string, n: number): string[] {
  const [a, m] = hoy.slice(0, 7).split("-").map(Number);
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(Date.UTC(a, m - 1 - (n - 1 - i), 1));
    return d.toISOString().slice(0, 7);
  });
}

/** Completa con cero los meses sin compras ni pagos, para que el gráfico no tenga huecos. */
export function serieMensual(
  meses: string[], comprado: { mes: string; total: string }[], pagado: { mes: string; total: string }[],
): MesCompra[] {
  const de = (filas: { mes: string; total: string }[], mes: string) =>
    filas.filter((f) => f.mes === mes).reduce((t, f) => t.plus(f.total), new Decimal(0)).toFixed(2);
  return meses.map((mes) => ({ mes, comprado: de(comprado, mes), pagado: de(pagado, mes) }));
}

export const TRAMOS = ["Al día", "1–30 días", "31–60 días", "61–90 días", "+90 días"] as const;
export type Tramo = (typeof TRAMOS)[number];

export interface TramoDeuda { tramo: Tramo; monto: string; facturas: number }

/**
 * Antigüedad de la deuda por días de vencida. Sin vencimiento cargado cuenta como al día
 * (no se puede decir que está vencida). Las notas de crédito restan en su tramo.
 */
export function antiguedad(abiertos: Pick<Abierto, "vencimiento" | "deuda">[], hoy: string): TramoDeuda[] {
  const acc = TRAMOS.map((tramo) => ({ tramo, monto: new Decimal(0), facturas: 0 }));
  for (const a of abiertos) {
    const dias = a.vencimiento ? diasEntre(a.vencimiento, hoy) : 0;
    const i = dias <= 0 ? 0 : dias <= 30 ? 1 : dias <= 60 ? 2 : dias <= 90 ? 3 : 4;
    acc[i].monto = acc[i].monto.plus(a.deuda);
    acc[i].facturas += 1;
  }
  return acc.map((t) => ({ tramo: t.tramo, monto: t.monto.toFixed(2), facturas: t.facturas }));
}

/** Agrupa y ordena de mayor a menor; lo que pasa de `max` va a "Otros". */
export function ranking(filas: { clave: string | null; total: string }[], max: number): { clave: string; total: string }[] {
  const m = new Map<string, Decimal>();
  for (const f of filas) {
    const k = f.clave?.trim() || "Sin dato";
    m.set(k, (m.get(k) ?? new Decimal(0)).plus(f.total));
  }
  const orden = [...m].sort((a, b) => b[1].comparedTo(a[1]));
  const top = orden.slice(0, max).map(([clave, t]) => ({ clave, total: t.toFixed(2) }));
  const resto = orden.slice(max).reduce((t, [, v]) => t.plus(v), new Decimal(0));
  return resto.isZero() ? top : [...top, { clave: "Otros", total: resto.toFixed(2) }];
}

export interface SemanaCaja {
  /** "vencido" para lo que ya pasó; si no, el lunes de la semana (YYYY-MM-DD). */
  desde: string;
  hasta: string | null;
  en_op: string;
  sin_op: string;
  /** Echeqs y cheques ya entregados (OP pagada) que salen de la cuenta esa semana. */
  comprometido: string;
  facturas: number;
}

/** El lunes de la semana de `fecha` (YYYY-MM-DD). */
export function lunesDe(fecha: string): string {
  const d = new Date(`${fecha}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7));
  return d.toISOString().slice(0, 10);
}

/**
 * La caja de las próximas `semanas`: lo que vence cada semana (lunes a domingo) partido
 * en lo que ya tiene OP y lo que falta armar, más lo ya comprometido en echeqs o cheques
 * que todavía no salieron. Primero va lo ya vencido. Sin vencimiento no entra.
 */
export function agendaCaja(
  abiertos: Pick<Abierto, "vencimiento" | "libre" | "en_op" | "deuda">[],
  comprometidos: { fecha: string; neto: string }[],
  hoy: string, semanas = 8,
): SemanaCaja[] {
  const lunes = lunesDe(hoy);
  const filas: { desde: string; hasta: string | null; en_op: Decimal; sin_op: Decimal; comprometido: Decimal; facturas: number }[] = [
    { desde: "vencido", hasta: null, en_op: new Decimal(0), sin_op: new Decimal(0), comprometido: new Decimal(0), facturas: 0 },
  ];
  for (let i = 0; i < semanas; i++) {
    const d = new Date(`${lunes}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() + i * 7);
    const desde = d.toISOString().slice(0, 10);
    d.setUTCDate(d.getUTCDate() + 6);
    filas.push({ desde, hasta: d.toISOString().slice(0, 10), en_op: new Decimal(0), sin_op: new Decimal(0), comprometido: new Decimal(0), facturas: 0 });
  }
  const fila = (f: string) => (f < hoy ? filas[0] : filas.find((x) => x.hasta && x.desde <= f && f <= x.hasta));
  for (const a of abiertos) {
    if (!a.vencimiento || new Decimal(a.deuda).lte(0.5)) continue;
    const x = fila(a.vencimiento);
    if (!x) continue;
    x.en_op = x.en_op.plus(a.en_op);
    x.sin_op = x.sin_op.plus(a.libre);
    x.facturas += 1;
  }
  for (const c of comprometidos) {
    const x = c.fecha >= hoy ? fila(c.fecha) : undefined;
    if (x) x.comprometido = x.comprometido.plus(c.neto);
  }
  return filas.map((x) => ({ desde: x.desde, hasta: x.hasta, en_op: x.en_op.toFixed(2), sin_op: x.sin_op.toFixed(2), comprometido: x.comprometido.toFixed(2), facturas: x.facturas }));
}
