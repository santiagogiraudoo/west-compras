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
import { leerDocumento } from "@/lib/entrada/leer";
import { cruzarFacturaNueva, esDelTipo, registrarEntrada, TIPOS_ARCHIVO } from "@/lib/entrada/procesar";
import { analizarLectura, mismoNumero, normalizarItems, normalizarNumero, TIPOS_COMPROBANTE, type Analisis, type LecturaFactura } from "@/lib/facturas/lectura";
import { cierra, leerMonto } from "@/lib/montos";
import { mensajeBase } from "@/lib/errores-base";
import { conciliarDespues } from "@/lib/entrada/conciliar.server";

const MAX = 10 * 1024 * 1024;

async function archivoDe(form: FormData): Promise<{ archivo: File; bytes: Buffer } | string> {
  const f = form.get("archivo");
  if (!(f instanceof File) || f.size === 0) return "Elegí la foto o el PDF de la factura.";
  if (!(TIPOS_ARCHIVO as readonly string[]).includes(f.type)) return "Tiene que ser un PDF o una foto (JPG, PNG o WEBP).";
  if (f.size > MAX) return "El archivo pesa más de 10 MB.";
  const bytes = Buffer.from(await f.arrayBuffer());
  if (!esDelTipo(bytes, f.type)) return "El archivo no es un PDF o una imagen válidos.";
  return { archivo: f, bytes };
}

/**
 * El mismo archivo ya cargado, por cualquier camino: desde acá antes del buzón
 * (app.archivos_factura) o por el buzón (app.entrada, que ya tiene su comprobante).
 */
async function yaCargado(sha: string): Promise<string | null> {
  const [ya] = await prisma.$queryRaw<{ id: string }[]>`
    select comprobante_id::text as id from app.archivos_factura where sha256 = ${sha}
    union all
    select comprobante_id::text from app.entrada where sha256 = ${sha} and comprobante_id is not null
    limit 1`;
  return ya?.id ?? null;
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
  // El mismo archivo ya cargado: se avisa y se lleva a esa factura.
  const sha = createHash("sha256").update(a.bytes).digest("hex");
  const ya = await yaCargado(sha);
  if (ya) return { ok: true, lectura: null, analisis: null, yaSubido: ya, mensaje: "Este mismo archivo ya se cargó." };

  // El mismo lector que el buzón (un solo contrato de lectura para la app, WhatsApp y el mail).
  const r = await leerDocumento(a.bytes, a.archivo.type);
  if (!r.ok) return { ok: true, lectura: null, analisis: null, mensaje: `No se pudo leer: ${r.mensaje}. Completá los datos a mano.` };
  if (!r.lectura.factura || !["factura", "nota_credito", "nota_debito"].includes(r.lectura.clase)) {
    const que = { remito: "un remito", compra: "una confirmación de compra", comprobante_pago: "un comprobante de pago" }[r.lectura.clase as string] ?? "otra cosa";
    return { ok: false, mensaje: `El archivo parece ${que}, no una factura. Subilo al Buzón: lo procesa y lo cruza solo.` };
  }
  const lectura = r.lectura.factura;
  const cuit = (lectura.cuit_emisor ?? r.lectura.cuit_emisor ?? "").replace(/\D/g, "");
  const proveedores = await prisma.proveedor.findMany({ where: { activo: true }, select: { codigo: true, cuit: true } });
  const prov = proveedores.find((p) => (p.cuit ?? "").replace(/\D/g, "") === cuit);
  const existentes = prov
    ? await prisma.$queryRaw<{ proveedor: string; numero: string }[]>`
        select proveedor_codigo as proveedor, numero from cc.comprobantes where proveedor_codigo = ${prov.codigo}`
    : [];
  return { ok: true, lectura, analisis: analizarLectura(lectura, proveedores, existentes, hoyArgentina()) };
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
 * (origen app), con el archivo en el buzón (app.entrada) y los remitos que ya estaban atados. Todo en una
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

  // El archivo queda en el buzón, como todo lo que entra (docs/proyecto/09): un solo lugar
  // para los archivos y el mismo control de repetidos para la app, WhatsApp y el mail.
  const reg = await registrarEntrada({
    canal: "app", nombre: a.archivo.name, tipo: a.archivo.type, bytes: a.bytes,
    remitente: session.user.email ?? session.user.name ?? null, remitenteNombre: session.user.name ?? null,
  });
  if (!reg.ok) return { ok: false, mensaje: reg.mensaje };
  if (!reg.nuevo && (await yaCargado(createHash("sha256").update(a.bytes).digest("hex")))) {
    return { ok: false, mensaje: "Este mismo archivo ya se cargó." };
  }
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const base = host ? `${h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https")}://${host}` : "";
  const dudas = d.dudas.trim() ? ` · ⚠️ revisar: ${d.dudas.trim()}` : "";
  const monto = (v: Decimal) => v.times(signo).toFixed(2);
  const clase = d.tipo.startsWith("Nota de Credito") ? "nota_credito" : d.tipo.startsWith("Nota de Debito") ? "nota_debito" : "factura";

  try {
    const { id, cruzados } = await prisma.$transaction(async (tx) => {
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
        "Archivo / link": `${base}/entrada/${reg.id}/archivo`,
      };
      const [{ r }] = await tx.$queryRaw<{ r: { cargados?: number; errores?: { error: string }[] } }[]>`
        select cc.cargar_nuevos(${JSON.stringify([fila])}::jsonb, 'app') as r`;
      if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
      const [nuevo] = await tx.$queryRaw<{ id: string }[]>`
        select id::text from cc.comprobantes where proveedor_codigo = ${d.proveedor} and numero = ${numero} order by id desc limit 1`;
      if (!nuevo) throw new Error("la base no cargó la factura");
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
      // Los remitos que llegaron antes se atan ahora (y con ellos, la compra).
      const cruce = signo > 0 ? await cruzarFacturaNueva(tx, d.proveedor, nuevo.id) : { cruzados: [], por: null };
      await tx.$executeRaw`
        update app.entrada set estado = 'procesado', clase = ${clase}, proveedor_codigo = ${d.proveedor},
          comprobante_id = ${BigInt(nuevo.id)}, procesado_en = now(),
          resultado = ${JSON.stringify({ cargada_a_mano: session.user!.name, ...cruce })}::jsonb
        where id = ${BigInt(reg.id)}`;
      return { id: nuevo.id, cruzados: cruce.cruzados };
    });
    await conciliarDespues(d.proveedor);
    revalidatePath("/bandeja");
    revalidatePath("/entrada");
    revalidatePath("/");
    const con = cruzados.length ? ` Se cruzó con ${cruzados.length === 1 ? "el remito" : "los remitos"} ${cruzados.join(", ")}.` : "";
    return { ok: true, id, mensaje: `Cargada ${d.tipo} ${numero}: ahora revisala y aprobala.${con}` };
  } catch (e) {
    return { ok: false, mensaje: `La base lo rechazó: ${mensajeBase(e instanceof Error ? e.message : String(e))}` };
  }
}
