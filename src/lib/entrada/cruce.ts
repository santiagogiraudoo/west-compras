import Decimal from "decimal.js";
import { cierra } from "@/lib/montos";

/**
 * Lo que la app necesita saber de la cadena compra ↔ remito ↔ factura. La cadena la arma la
 * base, por consecuencia, cada vez que entra o cambia un remito, una factura o una compra
 * (sql/023_conciliar_por_consecuencia.sql, con sus pruebas en sql/pruebas/): ahí están las
 * reglas de cruce, una sola vez. Acá queda solo lo que se calcula para mostrar o aprobar.
 */

/** La unidad que nombra un texto libre ("Dto Gutiérrez 110", "obra West Club"): solo si es una. */
export function unidadDelTexto(texto: string | null | undefined, unidades: { codigo: string; nombre: string }[]): string | null {
  if (!texto) return null;
  const norm = (s: string) => s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[.,;:]/g, " ").replace(/\s+/g, " ").trim();
  const t = ` ${norm(texto)} `;
  const hallados = unidades.filter((u) => {
    // "WCL - WEST CLUB" → "west club" y "wcl"; "SIRIA 455" → "siria 455".
    const partes = norm(u.nombre).split(" - ").map((x) => x.trim()).filter((x) => x.length >= 4 || /\d/.test(x));
    return partes.some((p) => t.includes(` ${p} `));
  });
  return hallados.length === 1 ? hallados[0].codigo : null;
}

/**
 * El control de tres puntas de una compra: lo facturado contra lo comprado (tolerancia cero,
 * menos de $1) y que sus remitos estén firmados. Es lo que permite aprobar una sola vez.
 */
export function tresPuntas(compraImporte: string | null, facturado: string, remitosFirmados: number, remitosSinFirmar: number):
  { cruza: boolean; motivos: string[] } {
  const motivos: string[] = [];
  if (compraImporte == null) motivos.push("la compra no tiene importe");
  else if (!cierra(compraImporte, facturado)) {
    const dif = new Decimal(facturado).minus(compraImporte);
    motivos.push(dif.gt(0) ? `se facturó $${dif.toFixed(2)} más que la compra` : `falta facturar $${dif.neg().toFixed(2)} de la compra`);
  }
  if (remitosFirmados === 0) motivos.push("ningún remito firmado");
  if (remitosSinFirmar > 0) motivos.push(`${remitosSinFirmar} remito(s) sin firmar`);
  return { cruza: motivos.length === 0, motivos };
}
