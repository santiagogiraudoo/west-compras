import Decimal from "decimal.js";
import { leerMonto } from "@/lib/montos";

/**
 * Operaciones extraordinarias: lo que no entra por el camino de siempre (factura del
 * plomero → Bandeja → OP) pero sí por las reglas (Adriano 17/11):
 * - "Sin factura": compra en negro. Aprobación sí o sí; nunca sale aprobada por tope.
 * - "Remito": pagar un remito que todavía no tiene factura.
 * Se cargan como un comprobante pendiente (cc.cargar_nuevos, origen app) y siguen el
 * circuito normal: se aprueban en la Bandeja con motivo y se pagan con una OP.
 * Anticipos no se hacen: por eso no hay "pago a cuenta" acá.
 */
export const TIPOS_EXTRA = ["Sin factura", "Remito"] as const;
export type TipoExtra = (typeof TIPOS_EXTRA)[number];

export interface DatosExtra {
  tipo: string;
  proveedor: string;
  unidad: string;
  facturadoA: string;
  fecha: string;
  total: string;
  numero: string;
  concepto: string;
  motivo: string;
}

/** El número de una compra sin factura: SF-AAAAMMDD-n, el siguiente libre de ese día. */
export function numeroSinFactura(fecha: string, existentes: string[]): string {
  const base = `SF-${fecha.replaceAll("-", "")}-`;
  const usados = existentes.filter((n) => n.startsWith(base)).map((n) => Number(n.slice(base.length)) || 0);
  return `${base}${Math.max(0, ...usados) + 1}`;
}

/** Lo que está mal en el formulario, por campo. Vacío: se puede cargar. */
export function validarExtra(d: DatosExtra, hoy: string): Partial<Record<keyof DatosExtra, string>> {
  const e: Partial<Record<keyof DatosExtra, string>> = {};
  if (!(TIPOS_EXTRA as readonly string[]).includes(d.tipo)) e.tipo = "Elegí qué es";
  if (!d.proveedor) e.proveedor = "Elegí el proveedor";
  if (!d.unidad) e.unidad = "Elegí la unidad";
  if (!d.facturadoA) e.facturadoA = "Elegí a nombre de quién";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) e.fecha = "Fecha inválida";
  else if (d.fecha > hoy) e.fecha = "No puede ser una fecha futura";
  let total: Decimal | null = null;
  try { total = new Decimal(leerMonto(d.total)); } catch { total = null; }
  if (!total || !total.isFinite() || total.lte(0)) e.total = "Poné un importe mayor a cero";
  if (d.tipo === "Remito" && d.numero.trim().length < 3) e.numero = "Poné el número del remito";
  if (d.concepto.trim().length < 5) e.concepto = "Contá qué se compró (al menos 5 letras)";
  if (d.motivo.trim().length < 10) e.motivo = "Explicá por qué va por afuera (al menos 10 letras)";
  return e;
}
