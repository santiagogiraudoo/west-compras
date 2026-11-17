"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { obtenerFactura } from "@/lib/facturas/queries";
import { requisitosFactura } from "@/lib/facturas/requisitos";
import { CATEGORIAS } from "@/lib/facturas/categorias";

export interface ResultadoAprobar {
  ok: boolean;
  mensaje: string;
}

interface Entrada {
  id: string;
  unidad: string;
  categoria: string;
  facturadoA: string;
  /** Obligatorio si la factura tiene excepciones (sin remito, sin factura). */
  motivo: string;
}

/**
 * Completa y aprueba una factura. Escribe SOLO con cc.cargar_nuevos (Corregir = SI),
 * así la base sigue validando y queda en cc.log_cargas y cc.cambios.
 * Antes de escribir vuelve a chequear los requisitos en el server: el botón
 * deshabilitado en pantalla no alcanza.
 */
export async function guardarYAprobar(e: Entrada): Promise<ResultadoAprobar> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") {
    return { ok: false, mensaje: "No tenés permiso para aprobar." };
  }

  const datos = await obtenerFactura(BigInt(e.id));
  if (!datos) return { ok: false, mensaje: "No encontré la factura." };
  const { c, remitos } = datos;

  const req = requisitosFactura(
    { ...c, unidad_codigo: e.unidad, categoria: e.categoria, facturado_a: e.facturadoA, tieneRemito: remitos.length > 0 || !!c.retiro_por },
    datos.proveedor,
  );
  if (e.categoria && !(CATEGORIAS as readonly string[]).includes(e.categoria)) {
    return { ok: false, mensaje: "Esa categoría no está en la lista." };
  }
  if (req.faltan.length > 0) return { ok: false, mensaje: req.faltan.join(" · ") };
  // Una ya aprobada solo se completa: no se re-aprueba ni cambia quién la aprobó.
  const yaAprobada = c.estado_aprobacion === "Aprobado";
  if (!yaAprobada && req.excepciones.length > 0 && e.motivo.trim().length < 5) {
    return { ok: false, mensaje: `Escribí el motivo: ${req.excepciones.join(" · ")}` };
  }

  // Con excepción, el motivo viaja pegado al aprobador: el trigger de la base
  // (cc._normalizar_comprobante) deja la persona en aprobado_por y guarda el texto
  // entero en aprobacion_detalle. Así no hace falta escribir directo en cc.
  const aprobadoPor = req.excepciones.length > 0
    ? `${session.user.name} (${req.excepciones.join(" · ")}: ${e.motivo.trim()})`
    : session.user.name;

  const fila = {
    Corregir: "SI",
    "Proveedor (elegir)": c.proveedor_codigo,
    "N° comprobante": c.numero,
    "Unidad de negocio (elegir)": e.unidad,
    // El rubro no se elige: sale del proveedor (03_definiciones). Si el proveedor no tiene, queda el que estaba.
    Rubro: datos.proveedor?.rubro ?? c.rubro,
    Categoria: e.categoria || null,
    "Facturado a (elegir)": e.facturadoA,
    ...(yaAprobada ? {} : { "Estado aprobacion": "Aprobado", "Aprobado por": aprobadoPor }),
  };

  const [{ r }] = await prisma.$queryRaw<{ r: { corregidos: number; errores: { error: string }[] } }[]>`
    select cc.cargar_nuevos(${JSON.stringify([fila])}::jsonb, 'app') as r`;

  if (r.errores?.length) return { ok: false, mensaje: `La base lo rechazó: ${r.errores.map((x) => x.error).join(" · ")}` };
  if (r.corregidos !== 1) return { ok: false, mensaje: "La base no actualizó la factura." };

  revalidatePath("/bandeja");
  revalidatePath("/");
  return { ok: true, mensaje: `${yaAprobada ? "Guardada" : "Aprobada"}: ${c.numero}` };
}
