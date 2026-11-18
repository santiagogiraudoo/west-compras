import Decimal from "decimal.js";

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

/** El número como lo guarda la base: punto de venta de 5 y número de 8 dígitos (00003-00008897). */
export function numeroComprobante(pv: string | null, numero: string | null): string | null {
  const p = digitos(pv);
  const n = digitos(numero);
  if (!n) return null;
  return `${(p || "0").padStart(5, "0").slice(-5)}-${n.padStart(8, "0").slice(-8)}`;
}

/** Mismo comprobante si coinciden punto de venta y número como números (4 o 5 dígitos da igual). */
export function mismoNumero(a: string, b: string): boolean {
  const partes = (s: string) => s.split("-").map((x) => Number(digitos(x)));
  const [pa, na] = partes(a);
  const [pb, nb] = partes(b);
  return na != null && na === nb && pa === pb;
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
  if (!l.fecha) avisos.push("No se leyó la fecha");
  if (!l.total) avisos.push("No se leyó el total");
  else {
    const suma = [l.neto, l.iva, l.percepciones].reduce((t, v) => t.plus(v ?? 0), new Decimal(0));
    if (l.neto && suma.minus(l.total).abs().gt(1)) avisos.push("El total no cierra con neto + IVA + percepciones");
  }
  for (const d of l.dudas) avisos.push(`La IA dudó: ${d}`);
  return { proveedor: prov?.codigo ?? null, tipo: tipoComprobante(l.tipo, l.letra), numero, avisos, repetida };
}
