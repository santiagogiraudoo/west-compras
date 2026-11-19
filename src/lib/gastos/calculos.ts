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

export interface MesGasto { mes: string; total: string; porCategoria: { categoria: string; total: string }[] }

/** Los meses pedidos (aunque no tengan gastos), cada uno con su total y por categoría. */
export function serieGastos(meses: string[], filas: { mes: string; categoria: string | null; total: string }[]): MesGasto[] {
  return meses.map((mes) => {
    const cats = new Map<string, Decimal>();
    for (const f of filas.filter((x) => x.mes === mes)) {
      const c = f.categoria ?? "Sin categoría";
      cats.set(c, (cats.get(c) ?? new Decimal(0)).plus(f.total));
    }
    const total = [...cats.values()].reduce((t, v) => t.plus(v), new Decimal(0));
    return { mes, total: total.toFixed(2), porCategoria: [...cats].sort((a, b) => b[1].comparedTo(a[1])).map(([categoria, t]) => ({ categoria, total: t.toFixed(2) })) };
  });
}

/** Variación porcentual contra el mes anterior, redondeada; null si el anterior fue cero. */
export function variacion(actual: string, anterior: string): number | null {
  const a = new Decimal(anterior);
  if (a.isZero()) return null;
  return new Decimal(actual).minus(a).div(a).times(100).toDecimalPlaces(0).toNumber();
}

export interface Matriz { filas: string[]; columnas: string[]; celda: Record<string, Record<string, string>>; max: number }

/** Dónde (propiedad, grupo o unidad) × categoría, ordenado por total, para el cruce. */
export function matrizGastos(gastos: Pick<Gasto, "destino" | "unidad" | "categoria" | "importe">[]): Matriz {
  const celda: Record<string, Record<string, Decimal>> = {};
  const porFila = new Map<string, Decimal>();
  const porCol = new Map<string, Decimal>();
  for (const g of gastos) {
    const f = g.destino ?? g.unidad;
    const c = g.categoria ?? "Sin categoría";
    celda[f] ??= {};
    celda[f][c] = (celda[f][c] ?? new Decimal(0)).plus(g.importe);
    porFila.set(f, (porFila.get(f) ?? new Decimal(0)).plus(g.importe));
    porCol.set(c, (porCol.get(c) ?? new Decimal(0)).plus(g.importe));
  }
  const orden = (m: Map<string, Decimal>) => [...m].sort((a, b) => b[1].comparedTo(a[1])).map(([k]) => k);
  const salida: Record<string, Record<string, string>> = {};
  let max = 0;
  for (const [f, cs] of Object.entries(celda)) {
    salida[f] = {};
    for (const [c, v] of Object.entries(cs)) { salida[f][c] = v.toFixed(2); max = Math.max(max, v.toNumber()); }
  }
  return { filas: orden(porFila), columnas: orden(porCol), celda: salida, max };
}
