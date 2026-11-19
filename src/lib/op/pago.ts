import Decimal from "decimal.js";

/**
 * El pago de una OP autorizada: cuadra total − retenciones = neto a transferir
 * (cc.cargar_pagos lo vuelve a chequear con margen de $1). Las retenciones se cargan a
 * mano hasta tener el doc de retenciones de Candela.
 */

/** El vencimiento que manda en la cola de pagos: el más próximo de sus facturas. */
export function vencimientoOP(lineas: { importe: string; vencimiento: string | null }[]): string | null {
  const v = lineas.filter((l) => !new Decimal(l.importe).isZero()).map((l) => l.vencimiento).filter((x): x is string => !!x).sort();
  return v[0] ?? null;
}

export const MEDIOS_PAGO = ["Transferencia", "Echeq", "Cheque", "Efectivo", "Compensacion", "Otros"] as const;
export type MedioPago = (typeof MEDIOS_PAGO)[number];

export const RETENCIONES = [
  { clave: "ganancias", campo: "Ret. Ganancias", label: "Ganancias" },
  { clave: "iva", campo: "Ret. IVA", label: "IVA" },
  { clave: "iibb", campo: "Ret. IIBB", label: "IIBB" },
  { clave: "suss", campo: "Ret. SUSS", label: "SUSS" },
  { clave: "otras", campo: "Otras ret.", label: "Otras" },
] as const;
export type ClaveRetencion = (typeof RETENCIONES)[number]["clave"];

export interface DatosPago {
  fecha: string;
  medio: string;
  referencia: string;
  comprobante: string;
  retenciones: Record<ClaveRetencion, string>;
}

const num = (s: string) => {
  const t = s.trim();
  if (t === "") return new Decimal(0);
  try { return new Decimal(t); } catch { return null; }
};

/** Medio sin banco de por medio: no tiene referencia bancaria. */
const sinReferencia = (medio: string) => medio === "Efectivo" || medio === "Compensacion";

/**
 * Valida el pago y arma los números. Los montos llegan como texto con punto decimal
 * ("1842.76"), que es como los manda el NumericInput; vacío es 0.
 */
export function calcularPago(total: string, d: DatosPago, hoy: string): {
  errores: string[];
  retenciones: Record<ClaveRetencion, string>;
  totalRetenciones: string;
  neto: string;
} {
  const errores: string[] = [];
  const ret = {} as Record<ClaveRetencion, string>;
  let suma = new Decimal(0);
  for (const r of RETENCIONES) {
    const v = num(d.retenciones[r.clave] ?? "");
    if (!v || v.isNegative()) { errores.push(`Retención ${r.label}: monto inválido`); ret[r.clave] = "0"; continue; }
    ret[r.clave] = v.toFixed(2);
    suma = suma.plus(v);
  }
  const neto = new Decimal(total).minus(suma);
  if (neto.isNegative()) errores.push("Las retenciones superan el total de la OP");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha)) errores.push("Falta la fecha de pago");
  else if (d.fecha > hoy) errores.push("La fecha de pago no puede ser futura");
  if (!(MEDIOS_PAGO as readonly string[]).includes(d.medio)) errores.push("Elegí el medio de pago");
  else if (!sinReferencia(d.medio) && d.referencia.trim().length < 3) errores.push("Falta la referencia bancaria");
  if (d.comprobante.trim() && !/^https?:\/\//.test(d.comprobante.trim())) errores.push("El comprobante tiene que ser un link");
  return { errores, retenciones: ret, totalRetenciones: suma.toFixed(2), neto: neto.toFixed(2) };
}

/** El medio de pago habitual del proveedor, si es uno de los que acepta la base. */
export function medioSugerido(habitual: string | null): MedioPago | "" {
  if (!habitual) return "";
  const h = habitual.toLowerCase();
  return MEDIOS_PAGO.find((m) => h.includes(m.toLowerCase())) ?? "";
}
