import Decimal from "decimal.js";

export interface Cotizacion {
  /** Promedio compra/venta del dólar blue, en pesos (decisión de Adriano 17/11). */
  promedio: string;
  compra: string;
  venta: string;
  fecha: string;
}

/**
 * Dólar blue de dolarapi.com (pública, sin clave), cacheada una hora. Si la API no
 * responde devuelve null: sin cotización no hay aprobación automática por tope, todo
 * renglón pide firma. Nunca se inventa una cotización.
 */
export async function dolarBlue(): Promise<Cotizacion | null> {
  try {
    const r = await fetch("https://dolarapi.com/v1/dolares/blue", { next: { revalidate: 3600 } });
    if (!r.ok) return null;
    const j = (await r.json()) as { compra?: number; venta?: number; fechaActualizacion?: string };
    if (!(Number(j.compra) > 0) || !(Number(j.venta) > 0)) return null;
    const compra = new Decimal(j.compra!);
    const venta = new Decimal(j.venta!);
    return {
      promedio: compra.plus(venta).div(2).toFixed(2), compra: compra.toFixed(2), venta: venta.toFixed(2),
      fecha: (j.fechaActualizacion ?? "").slice(0, 10),
    };
  } catch {
    return null;
  }
}
