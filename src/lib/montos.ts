import Decimal from "decimal.js";

/**
 * Las dos reglas de dinero que usa toda la app. Si una pantalla necesita leer un monto
 * escrito o decidir si dos montos "cierran", pasa por acá: así un mismo texto vale lo
 * mismo en todos lados y la tolerancia es una sola.
 */

/**
 * Tolerancia cero de Adriano: dos montos cierran si difieren en menos de $1 (centavos).
 * Es la misma de la base: `total_cuadra` en cc.comprobantes y `cargar_pagos`.
 */
export const TOLERANCIA = 1;

/** Cierran si la diferencia es menor a $1: 1000 contra 1000,99 sí; contra 1001 no. */
export function cierra(a: Decimal.Value, b: Decimal.Value): boolean {
  return new Decimal(a).minus(b).abs().lt(TOLERANCIA);
}

/**
 * Lo que tiene que quedar libre de una factura para contarla como "con algo para pagar":
 * menos de 50 centavos es redondeo, no deuda.
 */
export const MARGEN_LIBRE = 0.5;
export const hayLibre = (v: Decimal.Value): boolean => new Decimal(v).gt(MARGEN_LIBRE);

export class MontoInvalido extends Error {}

/**
 * Lee un monto escrito a mano o leído por la IA y lo devuelve como texto con punto
 * decimal ("1234.56"), listo para decimal.js o la base. Acepta:
 * - argentino: "1.234.567,89", "1234,5", "$ 1.500"
 * - con punto decimal, como lo mandan NumericInput y la IA: "1842.76"
 * - puntos de miles sin decimales: "12.500" (doce mil quinientos)
 * Rechaza lo que se puede leer de dos maneras en vez de adivinar: "1,234.56" (formato
 * de EE. UU.), "1.234.5", "1,2,3", y más decimales que los pedidos ("1,234" con 2).
 */
export function leerMonto(texto: string, decimales = 2): string {
  const t = String(texto ?? "").replace(/[\s$]/g, "");
  if (!t) throw new MontoInvalido("Falta el monto");
  const m = /^(-?)(.*)$/.exec(t)!;
  const [signo, cuerpo] = [m[1], m[2]];
  let limpio: string;
  if (/^\d{1,3}(\.\d{3})+,\d+$/.test(cuerpo) || /^\d+,\d+$/.test(cuerpo)) {
    limpio = cuerpo.replace(/\./g, "").replace(",", ".");
  } else if (/^\d{1,3}(\.\d{3})+$/.test(cuerpo)) {
    limpio = cuerpo.replace(/\./g, "");
  } else if (/^\d+(\.\d+)?$/.test(cuerpo)) {
    limpio = cuerpo;
  } else {
    throw new MontoInvalido(`"${texto}" no es un monto (escribilo como 1.234,56)`);
  }
  const dec = limpio.split(".")[1]?.length ?? 0;
  if (dec > decimales) throw new MontoInvalido(`"${texto}" tiene más de ${decimales} decimales`);
  return new Decimal(signo + limpio).toFixed(decimales);
}

/** Como leerMonto, pero null en vez de error (para avisos y vistas previas). */
export function leerMontoONull(texto: string, decimales = 2): string | null {
  try { return leerMonto(texto, decimales); } catch { return null; }
}
