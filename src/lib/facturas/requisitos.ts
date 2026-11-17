import Decimal from "decimal.js";

/**
 * Lo que una factura necesita para aprobarse (Adriano, 17/11: "cierta rigidez para
 * completar los datos sí o sí para aprobar").
 *
 * - `faltan`: frenan la aprobación. Sin esto el botón Aprobar no se habilita.
 * - `excepciones`: no frenan, pero hay que aprobar escribiendo un motivo
 *   (factura sin remito: "siempre excepción").
 * - `avisos`: no frenan la factura; frenan el PAGO más adelante (alta de proveedor).
 *
 * Una sola función para la bandeja y para la ficha: el motivo que se ve en la
 * lista es exactamente el que bloquea el botón.
 */
type Monto = string | number | { toString(): string };
const dec = (m: Monto) => new Decimal(m.toString());

export interface DatosFactura {
  tipo: string;
  unidad_codigo: string | null;
  rubro: string | null;
  facturado_a: string | null;
  archivo_link: string | null;
  // Prisma devuelve su propio Decimal: se pasa por texto para no mezclar instancias.
  neto: Monto;
  iva: Monto;
  percepciones: Monto;
  total: Monto;
  /** Hay un remito ligado, o la factura dice quién recibió. */
  tieneRemito: boolean;
}

export interface DatosProveedor {
  cuit: string | null;
  cbu_alias: string | null;
  condicion_iva: string | null;
  telefono: string | null;
  rubro: string | null;
  condicion_pago: string | null;
}

export interface Requisitos {
  faltan: string[];
  excepciones: string[];
  avisos: string[];
}

/**
 * Tipos que no llevan remito aparte: las notas de crédito y débito (tipos reales en la
 * base: "Nota de Credito A", "Nota de Debito A"...) y el tipo Remito, que ES el remito
 * (Ferretería Yrigoyen trabaja con remitos como deuda).
 */
export function noPideRemito(tipo: string): boolean {
  return tipo.startsWith("Nota de") || tipo === "Remito";
}

const vacio = (s: string | null | undefined) => !s || s.trim() === "";

export function requisitosFactura(f: DatosFactura, p: DatosProveedor | null): Requisitos {
  const faltan: string[] = [];
  const excepciones: string[] = [];
  const avisos: string[] = [];

  if (vacio(f.unidad_codigo)) faltan.push("Falta la unidad de negocio");
  if (vacio(f.rubro)) faltan.push("Falta el rubro");
  if (vacio(f.facturado_a)) faltan.push("Falta a nombre de quién está (titular)");
  if (f.tipo !== "Sin factura" && vacio(f.archivo_link)) faltan.push("Falta el PDF");

  // Mismo margen que la base (±$1) para no marcar redondeos.
  const suma = dec(f.neto).plus(dec(f.iva)).plus(dec(f.percepciones));
  if (suma.minus(dec(f.total)).abs().greaterThan(1)) {
    faltan.push("El total no cierra con neto + IVA + percepciones");
  }

  if (!f.tieneRemito && !noPideRemito(f.tipo)) {
    excepciones.push("Sin remito ni quién recibió");
  }
  if (f.tipo === "Sin factura") {
    excepciones.push("Compra sin factura: necesita aprobación con motivo");
  }

  if (!p) {
    avisos.push("Proveedor no encontrado");
  } else {
    if (vacio(p.cuit)) avisos.push("Proveedor sin CUIT");
    if (vacio(p.cbu_alias)) avisos.push("Proveedor sin CBU");
    if (vacio(p.condicion_iva)) avisos.push("Proveedor sin condición de IVA");
    if (vacio(p.telefono)) avisos.push("Proveedor sin WhatsApp");
    if (vacio(p.rubro)) avisos.push("Proveedor sin rubro");
    if (vacio(p.condicion_pago)) avisos.push("Proveedor sin condiciones de pago");
  }

  return { faltan, excepciones, avisos };
}

/** Lo que le falta al alta de un proveedor (decisión 17/11: obligatorio antes de pagar). */
export function faltantesProveedor(p: DatosProveedor): string[] {
  return requisitosFactura(
    { tipo: "FA", unidad_codigo: "x", rubro: "x", facturado_a: "x", archivo_link: "x",
      neto: 0, iva: 0, percepciones: 0, total: 0, tieneRemito: true },
    p,
  ).avisos.map((a) => a.replace("Proveedor sin ", ""));
}
