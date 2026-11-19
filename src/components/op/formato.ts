/**
 * Cómo se muestran los renglones de una factura en la tarjeta de aprobación. Solo forma:
 * no cambia lo que dicen.
 */

/** El renglón como se lee: sin el código interno, sin la marca, sin signos de mala lectura del PDF ni todo en mayúsculas. */
export function limpiarItem(s: string): string {
  const t = s.replace(/\s*\(código[^)]*\)/i, "").split(" - ")[0].replace(/[?�]/g, "").replace(/\s+/g, " ").trim();
  // "En mayúsculas" aunque traiga una unidad en minúscula ("ARENA COLORADA 6 mm").
  const letras = t.replace(/[^A-Za-zÁÉÍÓÚÑáéíóúñ]/g, "");
  const mayus = letras.replace(/[^A-ZÁÉÍÓÚÑ]/g, "").length;
  if (letras && mayus / letras.length >= 0.8) {
    const bajo = t.toLowerCase();
    return bajo.charAt(0).toUpperCase() + bajo.slice(1);
  }
  return t;
}

const corto = (s: string, n = 42) => (s.length > n ? `${s.slice(0, n - 1).trimEnd()}…` : s);

/**
 * El "qué" de una factura en pocas palabras: con uno o dos artículos, sus nombres cortos;
 * con más, el rubro del proveedor y la cantidad ("Limpieza · 17 artículos"). El detalle
 * entero está en "Ver más".
 */
export function queCorto(items: { descripcion: string }[] | null | undefined, rubro: string | null): string | null {
  if (!items?.length) return null;
  const nombres = [...new Set(items.map((i) => limpiarItem(i.descripcion)))];
  if (nombres.length <= 2) return nombres.map((n) => corto(n)).join(" y ");
  return `${rubro ?? "Artículos"} · ${nombres.length} artículos`;
}
