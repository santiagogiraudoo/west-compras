"use server";

import { mensajeBase } from "@/lib/errores-base";
import { leerMonto } from "@/lib/montos";
import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { unidadesDeLaMarca } from "@/lib/marca";
import { numeroSinFactura, validarExtra, type DatosExtra } from "@/lib/op/extraordinaria";

export interface ResultadoExtra {
  ok: boolean;
  mensaje: string;
  errores?: Partial<Record<keyof DatosExtra, string>>;
  id?: string;
}

/**
 * Carga una operación extraordinaria (compra sin factura o remito sin factura) como un
 * comprobante PENDIENTE con cc.cargar_nuevos (origen app): la base sigue validando y
 * auditando. No se aprueba acá: se aprueba en la Bandeja, con motivo, y se paga con OP.
 */
export async function cargarExtraordinaria(d: DatosExtra): Promise<ResultadoExtra> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") return { ok: false, mensaje: "No tenés permiso para cargar operaciones." };

  const hoy = hoyArgentina();
  const errores = validarExtra(d, hoy);
  if (Object.keys(errores).length) return { ok: false, mensaje: "Revisá los datos marcados.", errores };

  const [proveedor, unidades, titulares] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo: d.proveedor }, select: { codigo: true, razon_social: true, rubro: true } }),
    unidadesDeLaMarca(),
    prisma.$queryRaw<{ nombre: string }[]>`select nombre from cc.titulares where activo`,
  ]);
  if (!proveedor) return { ok: false, mensaje: "No encontré el proveedor.", errores: { proveedor: "No existe" } };
  if (!unidades.includes(d.unidad)) return { ok: false, mensaje: "Esa unidad no es de West Desarrolladora.", errores: { unidad: "No es de West" } };
  if (!titulares.some((t) => t.nombre === d.facturadoA)) return { ok: false, mensaje: "Ese titular no está en la lista.", errores: { facturadoA: "No está en la lista" } };

  const total = leerMonto(d.total);
  let numero = d.numero.trim();
  if (d.tipo === "Sin factura") {
    const existentes = await prisma.$queryRaw<{ numero: string }[]>`
      select numero from cc.comprobantes where proveedor_codigo = ${d.proveedor} and numero like ${`SF-${d.fecha.replaceAll("-", "")}-%`}`;
    numero = numeroSinFactura(d.fecha, existentes.map((x) => x.numero));
  } else {
    // Con la misma regla que la base (cc._clave_comprobante): "0001-123" y "0001-00000123" son el mismo remito.
    const [ya] = await prisma.$queryRaw<{ id: string }[]>`
      select id::text from cc.comprobantes where proveedor_codigo = ${d.proveedor}
        and cc._clave_comprobante(numero) = cc._clave_comprobante(${numero}) limit 1`;
    if (ya) return { ok: false, mensaje: `Ese remito ya está cargado para ${proveedor.razon_social}.`, errores: { numero: "Ya cargado" } };
  }

  const fila = {
    Fecha: d.fecha,
    "Unidad de negocio (elegir)": d.unidad,
    "Proveedor (elegir)": d.proveedor,
    "Facturado a (elegir)": d.facturadoA,
    Tipo: d.tipo,
    "N° comprobante": numero,
    Rubro: proveedor.rubro,
    // Quién la cargó y por qué va por afuera quedan en la descripción, a la vista en la Bandeja.
    Descripcion: `[app] ${d.concepto.trim()} · Operación extraordinaria (${d.tipo.toLowerCase()}): ${d.motivo.trim()} · Cargó ${session.user.name}`,
    Neto: total,
    IVA: "0",
    "Percepciones / otros": "0",
    Total: total,
    "Estado aprobacion": "Pendiente",
    "Plazo (dias)": "0",
    Vencimiento: d.fecha,
  };
  const [{ r }] = await prisma.$queryRaw<{ r: { cargados?: number; errores?: { error: string }[] } }[]>`
    select cc.cargar_nuevos(${JSON.stringify([fila])}::jsonb, 'app') as r`;
  if (r.errores?.length) return { ok: false, mensaje: `La base lo rechazó: ${r.errores.map((x) => mensajeBase(x.error)).join(" · ")}` };

  const [nuevo] = await prisma.$queryRaw<{ id: string }[]>`
    select id::text from cc.comprobantes where proveedor_codigo = ${d.proveedor} and numero = ${numero} order by id desc limit 1`;
  if (!nuevo) return { ok: false, mensaje: "La base no cargó la operación." };
  revalidatePath("/bandeja");
  revalidatePath("/");
  return { ok: true, mensaje: `Cargada ${d.tipo === "Sin factura" ? numero : `el remito ${numero}`}: ahora apruebala en la Bandeja`, id: nuevo.id };
}
