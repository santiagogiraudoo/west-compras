import Decimal from "decimal.js";
import type { Gasto } from "./queries";

export interface TotalDestino {
  /** La propiedad o grupo; si la unidad no es una, la unidad. */
  donde: string;
  esUnidad: boolean;
  total: string;
  porCategoria: { categoria: string; total: string }[];
}

/** Total por propiedad o grupo (o unidad sola) y, adentro, por categoría. Mayor primero. */
export function totalesPorDestino(gastos: Pick<Gasto, "destino" | "unidad" | "categoria" | "importe">[]): TotalDestino[] {
  const m = new Map<string, { esUnidad: boolean; total: Decimal; cats: Map<string, Decimal> }>();
  for (const g of gastos) {
    const donde = g.destino ?? g.unidad;
    const e = m.get(donde) ?? { esUnidad: !g.destino, total: new Decimal(0), cats: new Map() };
    e.total = e.total.plus(g.importe);
    const cat = g.categoria ?? "Sin categoría";
    e.cats.set(cat, (e.cats.get(cat) ?? new Decimal(0)).plus(g.importe));
    m.set(donde, e);
  }
  return [...m]
    .map(([donde, e]) => ({
      donde, esUnidad: e.esUnidad, total: e.total.toFixed(2),
      porCategoria: [...e.cats].sort((a, b) => b[1].comparedTo(a[1])).map(([categoria, t]) => ({ categoria, total: t.toFixed(2) })),
    }))
    .sort((a, b) => new Decimal(b.total).comparedTo(a.total));
}

/** Mes anterior y siguiente de YYYY-MM. */
export function mesVecino(mes: string, delta: number): string {
  const [a, m] = mes.split("-").map(Number);
  const d = new Date(Date.UTC(a, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}
