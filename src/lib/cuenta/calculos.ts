import Decimal from "decimal.js";
import { MARGEN_LIBRE } from "@/lib/montos";
import { parseDateString, toLocalDateString } from "@/lib/utils";

/**
 * Cuentas de la cuenta corriente de proveedores, sin base: reciben filas ya leídas de
 * cc.v_saldo_comprobante y devuelven números. Todo en decimal.js, en texto hacia afuera.
 *
 * Un solo criterio de "deuda" en toda la app: lo que falta PAGAR de una factura aprobada
 * = saldo de la vista (lo que no está en ninguna OP) + lo que está en OP previstas.
 * Una OP prevista todavía no es un pago: la factura sigue debiéndose, pero ya no está
 * libre para otra OP. Mismo margen que cc.v_deuda_proveedor: más de $0,50.
 */
// El de toda la app (src/lib/montos.ts): menos de 50 centavos es redondeo.
const MARGEN = new Decimal(MARGEN_LIBRE);

export interface Abierto {
  id: string;
  proveedor_codigo: string;
  razon_social: string;
  unidad_codigo: string | null;
  facturado_a: string | null;
  tipo: string;
  numero: string;
  fecha: string;
  vencimiento: string | null;
  total: string;
  /** Lo que no está en ninguna OP (saldo de cc.v_saldo_comprobante). */
  libre: string;
  /** Imputado en OP previstas. */
  en_op: string;
  /** OP previstas donde está, separadas por coma. */
  ops: string | null;
  /** libre + en_op: lo que falta pagar. */
  deuda: string;
}

export interface DeudaProveedor {
  codigo: string;
  razon_social: string;
  deuda: string;
  vencido: string;
  semana: string;
  en_op: string;
  proximo_vencimiento: string | null;
}

export interface Tablero {
  deuda: string;
  semana: string;
  vencido: string;
  en_op: string;
  porProveedor: DeudaProveedor[];
}

export function sumarDias(fecha: string, dias: number): string {
  const d = parseDateString(fecha);
  d.setUTCDate(d.getUTCDate() + dias);
  return toLocalDateString(d);
}

interface Acum { deuda: Decimal; vencido: Decimal; semana: Decimal; en_op: Decimal; prox: string | null; nombre: string }

/** Deuda total, a pagar en los próximos 7 días, vencida y por proveedor. `hoy` es YYYY-MM-DD. */
export function resumirDeuda(abiertos: Abierto[], hoy: string): Tablero {
  const finSemana = sumarDias(hoy, 7);
  const porProv = new Map<string, Acum>();
  const tot = { deuda: new Decimal(0), semana: new Decimal(0), vencido: new Decimal(0), en_op: new Decimal(0) };

  for (const a of abiertos) {
    const p = porProv.get(a.proveedor_codigo) ?? {
      deuda: new Decimal(0), vencido: new Decimal(0), semana: new Decimal(0), en_op: new Decimal(0),
      prox: null, nombre: a.razon_social,
    };
    porProv.set(a.proveedor_codigo, p);
    const deuda = new Decimal(a.deuda);
    if (!deuda.greaterThan(MARGEN)) continue;

    const enOp = new Decimal(a.en_op);
    p.deuda = p.deuda.plus(deuda);
    p.en_op = p.en_op.plus(enOp);
    tot.deuda = tot.deuda.plus(deuda);
    tot.en_op = tot.en_op.plus(enOp);
    const v = a.vencimiento;
    if (v && v < hoy) { p.vencido = p.vencido.plus(deuda); tot.vencido = tot.vencido.plus(deuda); }
    else if (v && v < finSemana) { p.semana = p.semana.plus(deuda); tot.semana = tot.semana.plus(deuda); }
    if (v && (!p.prox || v < p.prox)) p.prox = v;
  }

  const porProveedor = [...porProv]
    .filter(([, p]) => p.deuda.greaterThan(0))
    .map(([codigo, p]) => ({
      codigo, razon_social: p.nombre, deuda: p.deuda.toFixed(2), vencido: p.vencido.toFixed(2),
      semana: p.semana.toFixed(2), en_op: p.en_op.toFixed(2),
      proximo_vencimiento: p.prox,
    }))
    .sort((a, b) => new Decimal(b.deuda).comparedTo(new Decimal(a.deuda)));

  return {
    deuda: tot.deuda.toFixed(2), semana: tot.semana.toFixed(2), vencido: tot.vencido.toFixed(2),
    en_op: tot.en_op.toFixed(2), porProveedor,
  };
}

/** Un movimiento de la cuenta: importe con signo (positivo = le debemos más). */
export interface Movimiento {
  fecha: string;
  concepto: string;
  unidad: string | null;
  importe: string;
  /** "comprobante" o "pago": el mismo día van primero los comprobantes. */
  clase: "comprobante" | "pago";
  /** El id del comprobante o el número de la OP, para abrir su detalle. */
  ref?: string | null;
  /** La OP es de la app (tiene ficha). */
  de_app?: boolean;
}

export interface LineaExtracto {
  fecha: string;
  concepto: string;
  unidad: string | null;
  debe: string;
  haber: string;
  saldo: string;
  clase?: "comprobante" | "pago";
  ref?: string | null;
  de_app?: boolean;
}

export interface Extracto {
  lineas: LineaExtracto[];
  debe: string;
  haber: string;
  saldo: string;
}

/**
 * Extracto debe/haber desde el lado de West: la factura aprobada va al haber (le
 * debemos), el pago y la nota de crédito al debe. Una sola regla: el signo del importe.
 * Saldo positivo = le debemos; negativo = saldo a favor de West.
 */
export function armarExtracto(movs: Movimiento[]): Extracto {
  const orden = [...movs].sort((a, b) =>
    a.fecha === b.fecha ? (a.clase === b.clase ? 0 : a.clase === "comprobante" ? -1 : 1) : a.fecha < b.fecha ? -1 : 1);
  let saldo = new Decimal(0);
  let debe = new Decimal(0);
  let haber = new Decimal(0);
  const lineas = orden.map((m) => {
    const imp = new Decimal(m.importe);
    const h = imp.greaterThan(0) ? imp : new Decimal(0);
    const d = imp.lessThan(0) ? imp.neg() : new Decimal(0);
    haber = haber.plus(h);
    debe = debe.plus(d);
    saldo = saldo.plus(imp);
    return { fecha: m.fecha, concepto: m.concepto, unidad: m.unidad, debe: d.toFixed(2), haber: h.toFixed(2), saldo: saldo.toFixed(2), clase: m.clase, ref: m.ref ?? null, de_app: m.de_app ?? false };
  });
  return { lineas, debe: debe.toFixed(2), haber: haber.toFixed(2), saldo: saldo.toFixed(2) };
}

/**
 * Lo que se puede poner en una OP: lo libre (fuera de toda OP) de facturas aprobadas.
 * Reglas de la base que se adelantan en pantalla para no esperar el rechazo:
 * una OP es de un solo titular (cc._controlar_titular_imputacion: "no se cruzan
 * cuentas") y el total tiene que ser positivo.
 */
export function validarSeleccionOP(sel: Pick<Abierto, "facturado_a" | "libre" | "numero">[]): {
  errores: string[]; total: string; titular: string | null;
} {
  const errores: string[] = [];
  if (sel.length === 0) errores.push("Elegí al menos una factura");
  const titulares = [...new Set(sel.map((s) => s.facturado_a ?? ""))];
  if (titulares.includes("")) errores.push("Hay facturas sin titular: completalas en la bandeja");
  if (titulares.filter(Boolean).length > 1) errores.push("Una OP es de un solo titular: no se cruzan cuentas");
  const sinLibre = sel.filter((s) => new Decimal(s.libre).abs().lessThanOrEqualTo(MARGEN));
  if (sinLibre.length) errores.push(`Ya están en otra OP: ${sinLibre.map((s) => s.numero).join(", ")}`);
  const total = sel.reduce((t, s) => t.plus(new Decimal(s.libre)), new Decimal(0));
  if (sel.length > 0 && !total.greaterThan(0)) errores.push("El total de la OP tiene que ser positivo");
  return { errores, total: total.toFixed(2), titular: titulares.length === 1 && titulares[0] ? titulares[0] : null };
}

/** Factura que vence el mismo día que se emite: contado, o proveedor sin condición de pago. */
export const venceElDia = (a: Pick<Abierto, "fecha" | "vencimiento">) => !a.vencimiento || a.vencimiento <= a.fecha;

export interface PorVencer {
  proveedor_codigo: string;
  razon_social: string;
  facturas: number;
  libre: string;
  /** El vencimiento más próximo (o el más viejo, si ya venció). */
  vence: string;
}

/**
 * Para pagar en término: facturas con plazo pactado que vencen en los próximos `dias`
 * (o ya vencieron) y que siguen sin OP, por proveedor, la que vence primero arriba.
 * Las que vencen el mismo día que se emiten (contado o sin condición) no entran: vencen
 * antes de cargarse y llenarían la lista sin decir nada nuevo.
 */
export function porVencerSinOP(abiertos: Abierto[], hoy: string, dias = 7): PorVencer[] {
  const hasta = sumarDias(hoy, dias);
  const m = new Map<string, { nombre: string; n: number; libre: Decimal; vence: string }>();
  for (const a of abiertos) {
    if (venceElDia(a) || a.vencimiento! >= hasta) continue;
    const libre = new Decimal(a.libre);
    if (!libre.greaterThan(MARGEN)) continue;
    const p = m.get(a.proveedor_codigo) ?? { nombre: a.razon_social, n: 0, libre: new Decimal(0), vence: a.vencimiento! };
    p.n += 1;
    p.libre = p.libre.plus(libre);
    if (a.vencimiento! < p.vence) p.vence = a.vencimiento!;
    m.set(a.proveedor_codigo, p);
  }
  return [...m]
    .map(([codigo, p]) => ({ proveedor_codigo: codigo, razon_social: p.nombre, facturas: p.n, libre: p.libre.toFixed(2), vence: p.vence }))
    .sort((a, b) => a.vence.localeCompare(b.vence));
}
