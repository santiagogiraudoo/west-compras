"use server";

import { createHash } from "node:crypto";
import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { unidadesDeLaMarca } from "@/lib/marca";
import { CATEGORIAS } from "@/lib/facturas/categorias";
import { leerFactura } from "@/lib/facturas/leer-factura";
import { analizarLectura, mismoNumero, normalizarItems, normalizarNumero, TIPOS_COMPROBANTE, type Analisis, type LecturaFactura } from "@/lib/facturas/lectura";
import { cierra, leerMonto } from "@/lib/montos";
import { mensajeBase } from "@/lib/errores-base";

const TIPOS = ["application/pdf", "image/jpeg", "image/png", "image/webp"];
const MAX = 10 * 1024 * 1024;

/** Los primeros bytes tienen que corresponder al tipo declarado. */
function esDelTipo(b: Uint8Array, tipo: string): boolean {
  const empieza = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (tipo === "application/pdf") return empieza(0x25, 0x50, 0x44, 0x46);
  if (tipo === "image/jpeg") return empieza(0xff, 0xd8, 0xff);
  if (tipo === "image/png") return empieza(0x89, 0x50, 0x4e, 0x47);
  if (tipo === "image/webp") return empieza(0x52, 0x49, 0x46, 0x46);
  return false;
}

async function archivoDe(form: FormData): Promise<{ archivo: File; bytes: Buffer } | string> {
  const f = form.get("archivo");
  if (!(f instanceof File) || f.size === 0) return "Elegí la foto o el PDF de la factura.";
  if (!TIPOS.includes(f.type)) return "Tiene que ser un PDF o una foto (JPG, PNG o WEBP).";
  if (f.size > MAX) return "El archivo pesa más de 10 MB.";
  const bytes = Buffer.from(await f.arrayBuffer());
  if (!esDelTipo(bytes, f.type)) return "El archivo no es un PDF o una imagen válidos.";
  return { archivo: f, bytes };
}

export type ResultadoLeer =
  | { ok: true; lectura: LecturaFactura | null; analisis: Analisis | null; mensaje?: string; yaSubido?: string }
  | { ok: false; mensaje: string };

/**
 * Paso 1: lee la factura con IA y dice qué falta (proveedor por CUIT, repetida, total que
 * no cierra, dudas). No guarda nada. Si la IA no está o no puede, igual se completa a mano.
 */
export async function leerFacturaSubida(form: FormData): Promise<ResultadoLeer> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") return { ok: false, mensaje: "No tenés permiso para cargar facturas." };
  const a = await archivoDe(form);
  if (typeof a === "string") return { ok: false, mensaje: a };
  // El mismo archivo ya subido desde la app: se avisa y se lleva a esa factura.
  const sha = createHash("sha256").update(a.bytes).digest("hex");
  const [ya] = await prisma.$queryRaw<{ id: string }[]>`select comprobante_id::text as id from app.archivos_factura where sha256 = ${sha}`;
  if (ya) return { ok: true, lectura: null, analisis: null, yaSubido: ya.id, mensaje: "Este mismo archivo ya se cargó." };

  const r = await leerFactura(a.bytes, a.archivo.type);
  if (!r.ok) return { ok: true, lectura: null, analisis: null, mensaje: r.mensaje };
  const cuit = (r.lectura.cuit_emisor ?? "").replace(/\D/g, "");
  const proveedores = await prisma.proveedor.findMany({ where: { activo: true }, select: { codigo: true, cuit: true } });
  const prov = proveedores.find((p) => (p.cuit ?? "").replace(/\D/g, "") === cuit);
  const existentes = prov
    ? await prisma.$queryRaw<{ proveedor: string; numero: string }[]>`
        select proveedor_codigo as proveedor, numero from cc.comprobantes where proveedor_codigo = ${prov.codigo}`
    : [];
  return { ok: true, lectura: r.lectura, analisis: analizarLectura(r.lectura, proveedores, existentes) };
}

export interface DatosFactura {
  proveedor: string;
  tipo: string;
  numero: string;
  fecha: string;
  vencimiento: string;
  unidad: string;
  facturadoA: string;
  categoria: string;
  neto: string;
  iva: string;
  percepciones: string;
  total: string;
  descripcion: string;
  dudas: string;
  items: { descripcion: string; cantidad: string | null; precio_unitario: string | null; subtotal: string | null }[];
}

export type ResultadoGuardar = { ok: true; id: string; mensaje: string } | { ok: false; mensaje: string };

/**
 * Paso 2: carga la factura PENDIENTE con cc.cargar_nuevos e ítems con cc.cargar_items
 * (origen app), guarda el archivo en app.archivos_factura y le pone el link. Todo en una
 * transacción. Se aprueba después en la Bandeja, como cualquier otra.
 */
export async function guardarFacturaNueva(form: FormData): Promise<ResultadoGuardar> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") return { ok: false, mensaje: "No tenés permiso para cargar facturas." };
  const a = await archivoDe(form);
  if (typeof a === "string") return { ok: false, mensaje: a };
  let d: DatosFactura;
  try { d = JSON.parse(String(form.get("datos") ?? "")); } catch { return { ok: false, mensaje: "Faltan los datos de la factura." }; }

  const hoy = hoyArgentina();
  const falta: string[] = [];
  if (!d.proveedor) falta.push("el proveedor");
  if (!(TIPOS_COMPROBANTE as readonly string[]).includes(d.tipo)) falta.push("el tipo");
  // Siempre con 5 + 8 dígitos: "3-8897" y "0003-00008897" se guardan como 00003-00008897.
  const numero = normalizarNumero(d.numero ?? "");
  if (!numero) falta.push("el número (00003-00008897)");
  if (!/^\d{4}-\d{2}-\d{2}$/.test(d.fecha) || d.fecha > hoy) falta.push("la fecha (no futura)");
  if (d.vencimiento && !/^\d{4}-\d{2}-\d{2}$/.test(d.vencimiento)) falta.push("un vencimiento válido");
  else if (d.vencimiento && d.vencimiento < d.fecha) falta.push("un vencimiento que no sea anterior a la fecha");
  if (!d.unidad) falta.push("la unidad");
  if (!d.facturadoA) falta.push("a nombre de quién");
  if (falta.length || !numero) return { ok: false, mensaje: `Falta ${falta.join(", ")}.` };
  if (d.categoria && !(CATEGORIAS as readonly string[]).includes(d.categoria)) return { ok: false, mensaje: "Esa categoría no está en la lista." };

  let neto: Decimal, iva: Decimal, perc: Decimal, total: Decimal;
  try {
    [neto, iva, perc, total] = [d.neto, d.iva, d.percepciones, d.total].map((v) => new Decimal(leerMonto(v || "0")));
  } catch (e) { return { ok: false, mensaje: e instanceof Error ? e.message : "Algún importe no es un número." }; }
  if (total.lte(0)) return { ok: false, mensaje: "El total tiene que ser mayor a cero." };
  if (!cierra(neto.plus(iva).plus(perc), total)) return { ok: false, mensaje: "El total no cierra con neto + IVA + percepciones (menos de $1)." };
  const its = normalizarItems(d.items ?? []);
  if (!its.ok) return { ok: false, mensaje: its.mensaje };
  // La nota de crédito va en negativo, como la carga el plomero.
  const signo = d.tipo.startsWith("Nota de Credito") ? -1 : 1;

  const [prov, unidades, titulares, existentes] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo: d.proveedor }, select: { codigo: true, rubro: true, plazo_dias: true } }),
    unidadesDeLaMarca(),
    prisma.$queryRaw<{ nombre: string }[]>`select nombre from cc.titulares where activo`,
    prisma.$queryRaw<{ numero: string }[]>`select numero from cc.comprobantes where proveedor_codigo = ${d.proveedor}`,
  ]);
  if (!prov) return { ok: false, mensaje: "No encontré el proveedor." };
  if (!unidades.includes(d.unidad)) return { ok: false, mensaje: "Esa unidad no es de West Desarrolladora." };
  if (!titulares.some((t) => t.nombre === d.facturadoA)) return { ok: false, mensaje: "Ese titular no está en la lista." };
  if (existentes.some((e) => mismoNumero(e.numero, numero))) return { ok: false, mensaje: "Esa factura ya está cargada para ese proveedor." };

  const sha = createHash("sha256").update(a.bytes).digest("hex");
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : "";
  const dudas = d.dudas.trim() ? ` · ⚠️ revisar: ${d.dudas.trim()}` : "";
  const monto = (v: Decimal) => v.times(signo).toFixed(2);

  try {
    const id = await prisma.$transaction(async (tx) => {
      const fila = {
        Fecha: d.fecha,
        "Unidad de negocio (elegir)": d.unidad,
        "Proveedor (elegir)": d.proveedor,
        "Facturado a (elegir)": d.facturadoA,
        Tipo: d.tipo,
        "N° comprobante": numero,
        Rubro: prov.rubro,
        ...(d.categoria ? { Categoria: d.categoria } : {}),
        Descripcion: `[app] ${d.descripcion.trim() || "Factura cargada desde la app"}${dudas} · Cargó ${session.user!.name}`,
        Neto: monto(neto), IVA: monto(iva), "Percepciones / otros": monto(perc), Total: monto(total),
        "Estado aprobacion": "Pendiente",
        ...(d.vencimiento ? { Vencimiento: d.vencimiento } : prov.plazo_dias != null ? { "Plazo (dias)": String(prov.plazo_dias) } : {}),
      };
      const [{ r }] = await tx.$queryRaw<{ r: { cargados?: number; errores?: { error: string }[] } }[]>`
        select cc.cargar_nuevos(${JSON.stringify([fila])}::jsonb, 'app') as r`;
      if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
      const [nuevo] = await tx.$queryRaw<{ id: string }[]>`
        select id::text from cc.comprobantes where proveedor_codigo = ${d.proveedor} and numero = ${numero} order by id desc limit 1`;
      if (!nuevo) throw new Error("la base no cargó la factura");
      await tx.$executeRaw`
        insert into app.archivos_factura (comprobante_id, nombre, tipo, archivo, sha256, subido_por)
        values (${BigInt(nuevo.id)}, ${a.archivo.name}, ${a.archivo.type}, ${a.bytes}, ${sha}, ${session.user!.name})`;
      const link = [{ Corregir: "SI", "Proveedor (elegir)": d.proveedor, "N° comprobante": numero, "Archivo / link": `${base}/bandeja/${nuevo.id}/archivo` }];
      const [{ r: r2 }] = await tx.$queryRaw<{ r: { errores?: { error: string }[] } }[]>`select cc.cargar_nuevos(${JSON.stringify(link)}::jsonb, 'app') as r`;
      if (r2.errores?.length) throw new Error(r2.errores.map((x) => x.error).join(" · "));
      if (its.items.length) {
        const carga = { "Comprobante (clave)": `${d.proveedor} | ${numero}`, items: its.items.map((it) => ({
          ...it,
          // cc.cargar_items toma la unidad de negocio de cada ítem de "unidad".
          unidad: d.unidad,
        })) };
        // cargar_items tira error si no encuentra la factura; acá además se confirma que entraron todos.
        const [{ r: r3 }] = await tx.$queryRaw<{ r: { items?: number } | null }[]>`
          select cc.cargar_items(${JSON.stringify(carga)}::jsonb, 'app') as r`;
        if (r3?.items !== its.items.length) throw new Error("la base no cargó todos los ítems");
      }
      return nuevo.id;
    });
    revalidatePath("/bandeja");
    revalidatePath("/");
    return { ok: true, id, mensaje: `Cargada ${d.tipo} ${numero}: ahora revisala y aprobala` };
  } catch (e) {
    return { ok: false, mensaje: `La base lo rechazó: ${mensajeBase(e instanceof Error ? e.message : String(e))}` };
  }
}
