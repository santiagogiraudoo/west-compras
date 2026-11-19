import Decimal from "decimal.js";
import { cierra, leerMontoONull } from "@/lib/montos";
import { claveComprobante, mismoNumero } from "@/lib/facturas/lectura";

/**
 * Cruce remito ↔ factura, con las reglas del plomero (completar.py y
 * facturas.remitos_de_la_factura), de la más segura a la menos:
 * 1. el remito cita el número de la factura;
 * 2. la factura cita el número del remito (en su descripción);
 * 3. un solo candidato con el mismo importe (cierra: menos de $1) y fecha cercana;
 * 4. solo de factura a remitos: la factura es la suma de varios remitos abiertos ("factura de remitos").
 * Todo del mismo proveedor: quien llama ya filtró por proveedor.
 */

export interface RemitoCruce {
  id: string;
  numero: string | null;
  fecha: string | null;
  importe: string | null;
  /** Números de factura que figuran en el remito. */
  facturas_citadas?: string[];
}

export interface FacturaCruce {
  id: string;
  numero: string;
  fecha: string;
  total: string;
  descripcion?: string | null;
}

export type Por = "el remito cita la factura" | "la factura cita el remito" | "mismo importe y fecha" | "suma de remitos";

/** Días de diferencia que se aceptan entre remito y factura con el mismo importe. */
export const DIAS_CERCA = 10;
/** Hasta cuántos días antes de la factura se buscan remitos para una factura de remitos. */
export const DIAS_FACTURA_DE_REMITOS = 60;

const dias = (a: string, b: string) => Math.round((Date.parse(a) - Date.parse(b)) / 86_400_000);

/** Los números "PV-NRO" que aparecen en un texto libre ("Remito RE 0001-00011778", "X0000100013385"). */
export function numerosEnTexto(texto: string | null | undefined): string[] {
  if (!texto) return [];
  const out = new Set<string>();
  for (const m of texto.matchAll(/(\d{1,5})\s*-\s*(\d{1,8})/g)) out.add(`${m[1]}-${m[2]}`);
  // Pegados, como imprimen algunos sistemas: X + 5 de punto de venta + 8 de número.
  for (const m of texto.matchAll(/(?<!\d)(\d{5})(\d{8})(?!\d)/g)) out.add(`${m[1]}-${m[2]}`);
  return [...out];
}

const cita = (texto: string | null | undefined, numero: string | null) =>
  !!numero && claveComprobante(numero).base.includes("-") && numerosEnTexto(texto).some((n) => mismoNumero(n, numero));

const importe = (v: string | null) => (v == null ? null : leerMontoONull(v));

/** La factura de un remito que acaba de llegar (o null si no hay una sola segura). */
export function facturaDelRemito(r: RemitoCruce, facturas: FacturaCruce[]): { factura: FacturaCruce; por: Por } | null {
  const citada = facturas.filter((f) => (r.facturas_citadas ?? []).some((n) => mismoNumero(n, f.numero)));
  if (citada.length === 1) return { factura: citada[0], por: "el remito cita la factura" };
  const laCitan = facturas.filter((f) => cita(f.descripcion, r.numero));
  if (laCitan.length === 1) return { factura: laCitan[0], por: "la factura cita el remito" };
  const imp = importe(r.importe);
  if (imp && r.fecha) {
    const mismas = facturas.filter((f) => cierra(imp, f.total) && Math.abs(dias(f.fecha, r.fecha!)) <= DIAS_CERCA);
    if (mismas.length === 1) return { factura: mismas[0], por: "mismo importe y fecha" };
  }
  return null;
}

/** Los remitos abiertos que corresponden a una factura que acaba de llegar (o null). */
export function remitosDeLaFactura(f: FacturaCruce, remitos: RemitoCruce[]): { remitos: RemitoCruce[]; por: Por } | null {
  const laCitan = remitos.filter((r) => (r.facturas_citadas ?? []).some((n) => mismoNumero(n, f.numero)));
  if (laCitan.length) return { remitos: laCitan, por: "el remito cita la factura" };
  const citados = remitos.filter((r) => cita(f.descripcion, r.numero));
  if (citados.length) return { remitos: citados, por: "la factura cita el remito" };
  const cerca = remitos.filter((r) => r.fecha && importe(r.importe));
  const mismo = cerca.filter((r) => cierra(importe(r.importe)!, f.total) && Math.abs(dias(f.fecha, r.fecha!)) <= DIAS_CERCA);
  if (mismo.length === 1) return { remitos: mismo, por: "mismo importe y fecha" };
  const antes = cerca.filter((r) => r.fecha! <= f.fecha && dias(f.fecha, r.fecha!) <= DIAS_FACTURA_DE_REMITOS);
  const suma = subconjunto(antes, f.total);
  if (suma && suma.length > 1) return { remitos: suma, por: "suma de remitos" };
  return null;
}

/**
 * Remitos cuyos importes suman el total (en centavos exactos, como el plomero): primero todos,
 * después todos menos uno, después una búsqueda con tope de intentos.
 */
export function subconjunto(todos: RemitoCruce[], total: string, tope = 200_000): RemitoCruce[] | null {
  const remitos = todos.filter((r) => importe(r.importe) != null); // sin importe no suma
  const cent = (v: string) => new Decimal(v).times(100).round().toNumber();
  const vals = remitos.map((r) => cent(importe(r.importe)!));
  const objetivo = cent(total);
  if (!remitos.length) return null;
  const suma = vals.reduce((a, b) => a + b, 0);
  if (suma === objetivo) return remitos;
  const sobra = vals.findIndex((v) => suma - v === objetivo);
  if (sobra >= 0) return remitos.filter((_, i) => i !== sobra);
  const resto = vals.map((_, i) => vals.slice(i).reduce((a, b) => a + b, 0));
  let intentos = 0;
  const buscar = (i: number, falta: number, elegidos: number[]): number[] | null => {
    if (++intentos > tope) return null;
    if (falta === 0) return elegidos;
    if (i >= vals.length || falta < 0 || resto[i] < falta) return null;
    return buscar(i + 1, falta - vals[i], [...elegidos, i]) ?? buscar(i + 1, falta, elegidos);
  };
  const r = buscar(0, objetivo, []);
  return r ? r.map((i) => remitos[i]) : null;
}

// ── Compras: la tercera punta (compra ↔ remito ↔ factura) ─────────────────────

export interface CompraCruce {
  id: string;
  /** Clave de la compra en cc.compras (ClickUp o "app:…"): con ella se le atan remitos. */
  clave: string;
  /** Número de pedido, presupuesto u orden, si lo tiene. */
  numero: string | null;
  fecha: string;
  importe: string | null;
  estado: string;
}

/** Hasta cuántos días después de la compra puede llegar su remito. */
export const DIAS_COMPRA_A_REMITO = 60;
const ABIERTA = new Set(["pedido confirmado", "esperando remito"]);

/**
 * La compra de un remito: una abierta del mismo proveedor que el remito cite, o la única con el
 * mismo importe (cierra) y que sea de antes del remito (hasta 60 días). Si no hay una sola, null:
 * el remito crea su propia compra ("la compra entra con el remito o la confirmación").
 */
export function compraDelRemito(r: RemitoCruce, compras: CompraCruce[]): { compra: CompraCruce; por: string } | null {
  const abiertas = compras.filter((c) => ABIERTA.has(c.estado));
  const citada = abiertas.filter((c) => c.numero && (r.facturas_citadas ?? []).some((n) => mismoNumero(n, c.numero!)));
  if (citada.length === 1) return { compra: citada[0], por: "el remito cita la compra" };
  const imp = importe(r.importe);
  if (imp && r.fecha) {
    const mismas = abiertas.filter((c) => {
      const ci = importe(c.importe);
      const d = dias(r.fecha!, c.fecha);
      return ci != null && cierra(imp, ci) && d >= 0 && d <= DIAS_COMPRA_A_REMITO;
    });
    if (mismas.length === 1) return { compra: mismas[0], por: "mismo importe" };
  }
  return null;
}

/** Los remitos sueltos (sin compra) que corresponden a una compra que acaba de llegar. */
export function remitosDeLaCompra(c: CompraCruce, remitos: RemitoCruce[]): RemitoCruce[] {
  const citan = remitos.filter((r) => c.numero && (r.facturas_citadas ?? []).some((n) => mismoNumero(n, c.numero!)));
  if (citan.length) return citan;
  const ci = importe(c.importe);
  if (!ci) return [];
  const despues = remitos.filter((r) => r.fecha && importe(r.importe) && dias(r.fecha, c.fecha) >= 0 && dias(r.fecha, c.fecha) <= DIAS_COMPRA_A_REMITO);
  const uno = despues.filter((r) => cierra(importe(r.importe)!, ci));
  if (uno.length === 1) return uno;
  return subconjunto(despues, ci) ?? []; // entregas parciales que suman la compra
}

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
