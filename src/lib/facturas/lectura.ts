import Decimal from "decimal.js";
import { cierra, leerMonto } from "@/lib/montos";

/** Lo que Claude lee de una factura (mismo esquema que el plomero, documentos.py). */
export interface LecturaFactura {
  es_factura: boolean;
  cuit_emisor: string | null;
  razon_social: string | null;
  /** FA, NC o ND. */
  tipo: "FA" | "NC" | "ND" | null;
  letra: string | null;
  punto_venta: string | null;
  numero: string | null;
  fecha: string | null;
  vencimiento: string | null;
  cuit_receptor: string | null;
  neto: string | null;
  iva: string | null;
  percepciones: string | null;
  total: string | null;
  items: { descripcion: string; cantidad: string | null; precio_unitario: string | null; subtotal: string | null }[];
  dudas: string[];
}

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/** El tipo como lo guarda la base: "Factura A", "Nota de Credito A", "Nota de Debito C". */
export function tipoComprobante(tipo: LecturaFactura["tipo"], letra: string | null): string {
  const l = (letra ?? "").trim().toUpperCase().slice(0, 1) || "A";
  return `${tipo === "NC" ? "Nota de Credito" : tipo === "ND" ? "Nota de Debito" : "Factura"} ${l}`;
}

/**
 * Los tipos que se cargan desde la app (Añadir factura). Es un pedazo de la lista de la
 * base (comprobantes_tipo_check), que además tiene Ticket, Remito, Recibo y Sin factura.
 */
export const TIPOS_COMPROBANTE = [
  "Factura A", "Factura B", "Factura C", "Factura M", "Factura X",
  "Nota de Credito A", "Nota de Credito B", "Nota de Credito C",
  "Nota de Debito A", "Nota de Debito B", "Nota de Debito C",
] as const;

/** El número como lo guarda la base: punto de venta de 5 y número de 8 dígitos (00003-00008897). */
export function numeroComprobante(pv: string | null, numero: string | null): string | null {
  // La IA a veces trae el número entero ("0003-00008897") y el punto de venta vacío.
  if (!digitos(pv) && numero && /^\s*\d{1,5}\s*-\s*\d{1,8}\s*$/.test(numero)) {
    const [p, n] = numero.split("-");
    return numeroComprobante(p, n);
  }
  const p = digitos(pv);
  const n = digitos(numero);
  if (!n) return null;
  return `${(p || "0").padStart(5, "0").slice(-5)}-${n.padStart(8, "0").slice(-8)}`;
}

/**
 * Un número tipeado a mano, llevado al formato de la base si es punto de venta y número
 * ("3-8897" → "00003-00008897"); si no tiene esa forma, null (no se carga así).
 */
export function normalizarNumero(texto: string): string | null {
  const m = /^\s*(\d{1,5})\s*-\s*(\d{1,8})\s*$/.exec(texto);
  return m ? numeroComprobante(m[1], m[2]) : null;
}

/**
 * Los ítems como los guarda la base: montos leídos con leerMonto y en el signo del
 * documento (el mismo criterio del histórico): un ítem va en positivo aunque la factura
 * sea una nota de crédito, y en negativo solo si es un descuento dentro de la factura. El
 * signo de la nota de crédito lo lleva el comprobante, no sus ítems.
 * Devuelve el primer ítem que no se pudo leer como error.
 */
export function normalizarItems(items: LecturaFactura["items"]):
  { ok: true; items: { descripcion: string; cantidad: string | null; precio_unitario: string | null; subtotal: string | null }[] }
  | { ok: false; mensaje: string } {
  const out = [];
  for (const [i, it] of items.entries()) {
    const descripcion = (it.descripcion ?? "").trim();
    if (!descripcion) continue;
    const leer = (v: string | null, dec: number) => (v == null || String(v).trim() === "" ? null : leerMonto(String(v), dec));
    try {
      out.push({ descripcion, cantidad: leer(it.cantidad, 4), precio_unitario: leer(it.precio_unitario, 4), subtotal: leer(it.subtotal, 2) });
    } catch (e) {
      return { ok: false, mensaje: `Ítem ${i + 1} (${descripcion}): ${e instanceof Error ? e.message : "monto inválido"}` };
    }
  }
  return { ok: true, items: out };
}

/**
 * La clave de un número de comprobante, para compararlo sin importar cómo se escribió.
 * - "0003-00045093", "00003-00045093" y "3-45093" son el mismo: base "3-45093".
 * - Lo que viene después es el sufijo de una factura partida por unidad, en cualquiera de
 *   las convenciones de la base ("-A", "/A", " · FEEDLOT"): sufijo "A" o "FEEDLOT".
 * - Lo que no es punto de venta y número ("VEN-SN 15/10 OSB", "SALDO-ANTERIOR") se compara
 *   entero, sin acentos, en mayúsculas y con los espacios de más sacados.
 * Es la misma regla que cc._clave_comprobante en la base (sql/020): si cambia una, cambia la otra.
 */
export function claveComprobante(numero: string): { base: string; sufijo: string } {
  const limpio = numero.normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
  const m = /^(\d{1,5}) ?- ?(\d{1,8})(?!\d)(.*)$/.exec(limpio);
  if (!m) return { base: limpio, sufijo: "" };
  return { base: `${Number(m[1])}-${Number(m[2])}`, sufijo: m[3].replace(/[^A-Z0-9]/g, "") };
}

/**
 * Mismo comprobante si coincide la base (punto de venta y número como números). El sufijo de
 * factura partida no cuenta: si ya se cargó 0003-00045093-A, una 00003-00045093 nueva es la
 * misma factura y se avisa como repetida.
 */
export function mismoNumero(a: string, b: string): boolean {
  const ka = claveComprobante(a).base;
  return ka !== "" && ka === claveComprobante(b).base;
}

export interface Analisis {
  proveedor: string | null;
  tipo: string;
  numero: string | null;
  /** Lo que falta o hay que mirar antes de cargarla, una frase cada uno. */
  avisos: string[];
  /** Ya está cargada para ese proveedor: no se carga de nuevo. */
  repetida: boolean;
}

/**
 * Lo que la app puede decir de una lectura antes de cargarla: de qué proveedor es (por
 * CUIT), si ya está cargada, si el total cierra (±$1, como la base) y qué dudó la IA.
 * El resto (unidad, titular, categoría) lo completa quien la carga.
 */
export function analizarLectura(
  l: LecturaFactura,
  proveedores: { codigo: string; cuit: string | null }[],
  existentes: { proveedor: string; numero: string }[],
): Analisis {
  const avisos: string[] = [];
  const cuit = digitos(l.cuit_emisor);
  const prov = cuit ? proveedores.find((p) => digitos(p.cuit) === cuit) : undefined;
  if (!cuit) avisos.push("No se leyó el CUIT del emisor: elegí el proveedor");
  else if (!prov) avisos.push(`El CUIT ${l.cuit_emisor} no es de ningún proveedor: dalo de alta o elegilo`);
  const numero = numeroComprobante(l.punto_venta, l.numero);
  if (!numero) avisos.push("No se leyó el número de la factura");
  const repetida = !!(prov && numero && existentes.some((e) => e.proveedor === prov.codigo && mismoNumero(e.numero, numero)));
  if (repetida) avisos.push("Esta factura ya está cargada");
  if (!l.letra?.trim()) avisos.push("No se leyó la letra (A, B o C): revisá el tipo");
  if (!l.fecha) avisos.push("No se leyó la fecha");
  else if (l.vencimiento && l.vencimiento < l.fecha) avisos.push("El vencimiento es anterior a la fecha: revisalo");
  if (!l.total) avisos.push("No se leyó el total");
  else {
    const suma = [l.neto, l.iva, l.percepciones].reduce((t, v) => t.plus(v ?? 0), new Decimal(0));
    if (l.neto && !cierra(suma, l.total)) avisos.push("El total no cierra con neto + IVA + percepciones");
  }
  for (const d of l.dudas) avisos.push(`La IA dudó: ${d}`);
  return { proveedor: prov?.codigo ?? null, tipo: tipoComprobante(l.tipo, l.letra), numero, avisos, repetida };
}
