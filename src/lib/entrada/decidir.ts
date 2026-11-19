import { analizarLectura, type LecturaFactura } from "@/lib/facturas/lectura";
import { normalizarCuit, normalizarTelefono } from "@/lib/proveedores/validar";

/**
 * Qué hacer con un documento del buzón (app.entrada) una vez leído. Puro: recibe la lectura
 * y lo que hace falta saber de la base, y devuelve la acción con su motivo. Quien ejecuta es
 * procesar.ts. Reglas en docs/proyecto/09_flujo_entrada.md.
 */

export const CLASES = ["factura", "nota_credito", "nota_debito", "remito", "comprobante_pago", "otro"] as const;
export type Clase = (typeof CLASES)[number];

export interface LecturaRemito {
  numero: string | null;
  fecha: string | null;
  /** Números de factura que figuran en el remito. */
  facturas_citadas: string[];
  retira: string | null;
  autoriza: string | null;
  destino: string | null;
  importe: string | null;
  /** Tiene firma o aclaración de quien recibió. */
  firmado: boolean;
}

/** Lo que devuelve la lectura del buzón: qué es y sus datos (la parte que corresponda). */
export interface LecturaEntrada {
  clase: Clase;
  cuit_emisor: string | null;
  razon_social: string | null;
  factura: LecturaFactura | null;
  remito: LecturaRemito | null;
  dudas: string[];
}

export interface Contexto {
  proveedores: { codigo: string; cuit: string | null; telefono: string | null }[];
  titulares: { nombre: string; cuit: string | null }[];
  /** Comprobantes ya cargados del proveedor (para repetidos). */
  existentes: { proveedor: string; numero: string }[];
  /** Teléfono de quien mandó el documento por WhatsApp (cualquier formato). */
  remitente?: string | null;
  hoy: string;
}

export type Accion =
  | { tipo: "cargar_factura"; proveedor: string; titular: string | null; numero: string; avisos: string[] }
  | { tipo: "cargar_remito"; proveedor: string; avisos: string[] }
  | { tipo: "comprobante_pago"; proveedor: string | null }
  | { tipo: "duplicado"; motivo: string; proveedor: string }
  | { tipo: "revisar"; motivo: string; proveedor: string | null }
  | { tipo: "descartar"; motivo: string };

const digitos = (s: string | null | undefined) => (s ?? "").replace(/\D/g, "");

/**
 * De qué proveedor es: por el CUIT del emisor; si no se leyó CUIT, por el teléfono de quien lo
 * mandó (un proveedor que manda su propia factura por WhatsApp). Un CUIT con el verificador mal
 * es una mala lectura: no se adivina por teléfono, se manda a revisar.
 */
export function identificarProveedor(cuit: string | null, ctx: Pick<Contexto, "proveedores" | "remitente">):
  { codigo: string; por: "cuit" | "telefono" } | { codigo: null; motivo: string } {
  const c = digitos(cuit);
  if (c) {
    if (!normalizarCuit(c)) return { codigo: null, motivo: `el CUIT ${cuit} no es válido (se leyó mal)` };
    const p = ctx.proveedores.find((x) => digitos(x.cuit) === c);
    return p ? { codigo: p.codigo, por: "cuit" } : { codigo: null, motivo: `el CUIT ${cuit} no es de ningún proveedor: dalo de alta` };
  }
  const tel = ctx.remitente ? normalizarTelefono(ctx.remitente) : null;
  const porTel = tel ? ctx.proveedores.filter((x) => x.telefono && normalizarTelefono(x.telefono) === tel) : [];
  if (porTel.length === 1) return { codigo: porTel[0].codigo, por: "telefono" };
  return { codigo: null, motivo: "no se leyó el CUIT del emisor y no se sabe de qué proveedor es" };
}

/** El titular ("a nombre de") por el CUIT del receptor, si es uno de la lista. */
export function titularPorCuit(cuit: string | null, titulares: Contexto["titulares"]): string | null {
  const c = digitos(cuit);
  return c ? titulares.find((t) => digitos(t.cuit) === c)?.nombre ?? null : null;
}

export function decidirEntrada(l: LecturaEntrada, ctx: Contexto): Accion {
  if (l.clase === "otro") return { tipo: "descartar", motivo: "no es una factura, nota de crédito, remito ni comprobante de pago" };
  const prov = identificarProveedor(l.cuit_emisor, ctx);
  if (l.clase === "comprobante_pago") return { tipo: "comprobante_pago", proveedor: prov.codigo };
  if (!prov.codigo) return { tipo: "revisar", motivo: "motivo" in prov ? prov.motivo : "sin proveedor", proveedor: null };

  if (l.clase === "remito") {
    if (!l.remito) return { tipo: "revisar", motivo: "es un remito pero no se pudo leer", proveedor: prov.codigo };
    const avisos = [...l.dudas.map((d) => `La IA dudó: ${d}`)];
    if (!l.remito.numero) avisos.push("Remito sin número");
    if (!l.remito.firmado) avisos.push("Remito sin firma de quien recibió");
    return { tipo: "cargar_remito", proveedor: prov.codigo, avisos };
  }

  // Factura, nota de crédito o de débito: los mismos controles que Añadir factura y el plomero.
  if (!l.factura) return { tipo: "revisar", motivo: "es un comprobante pero no se pudo leer", proveedor: prov.codigo };
  const a = analizarLectura(l.factura, ctx.proveedores, ctx.existentes.filter((e) => e.proveedor === prov.codigo), ctx.hoy);
  if (a.repetida) return { tipo: "duplicado", motivo: `${a.numero} ya está cargada`, proveedor: prov.codigo };
  if (!a.numero) return { tipo: "revisar", motivo: "no se leyó el número del comprobante", proveedor: prov.codigo };
  if (!l.factura.total) return { tipo: "revisar", motivo: "no se leyó el total", proveedor: prov.codigo };
  if (!l.factura.fecha) return { tipo: "revisar", motivo: "no se leyó la fecha", proveedor: prov.codigo };
  // Lo que analizarLectura dice del proveedor ya lo resolvió identificarProveedor (también por teléfono).
  const avisos = a.avisos.filter((x) => !/CUIT .* (no es de ningún proveedor|no se leyó)|No se leyó el CUIT|ya está cargada/.test(x));
  return { tipo: "cargar_factura", proveedor: prov.codigo, titular: titularPorCuit(l.factura.cuit_receptor, ctx.titulares), numero: a.numero, avisos };
}
