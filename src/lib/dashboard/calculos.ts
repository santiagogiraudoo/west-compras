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
