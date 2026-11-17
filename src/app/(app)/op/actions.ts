"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listarAbiertos } from "@/lib/cuenta/queries";
import { validarSeleccionOP } from "@/lib/cuenta/calculos";
import { faltantesProveedor } from "@/lib/facturas/requisitos";

export interface ResultadoOP {
  ok: boolean;
  mensaje: string;
  numero?: string;
}

interface ResultadoCarga {
  ordenes: number;
  imputaciones: number;
  errores: { error: string }[];
}

class Rechazo extends Error {}

/**
 * Reserva una OP Prevista con las facturas elegidas, cada una por lo que tiene libre.
 * Escribe SOLO con las funciones de la base: cc.proxima_op da el número y
 * cc.cargar_pagos graba la OP y sus imputaciones (y frena doble pago y cruce de titulares).
 * cargar_pagos no corta ante un error, los devuelve: por eso va todo en una transacción
 * y cualquier error la deshace, número incluido. No queda una OP a medias.
 */
export async function reservarOP(proveedor: string, ids: string[]): Promise<ResultadoOP> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") {
    return { ok: false, mensaje: "No tenés permiso para armar OP." };
  }

  // Se vuelve a leer todo en el server: lo que mande la pantalla puede estar viejo.
  const [prov, abiertos] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo: proveedor } }),
    listarAbiertos(proveedor),
  ]);
  if (!prov) return { ok: false, mensaje: "No encontré el proveedor." };
  const faltan = faltantesProveedor(prov);
  if (faltan.length) return { ok: false, mensaje: `Antes de pagar completá el alta: falta ${faltan.join(", ")}` };

  const elegidas = abiertos.filter((a) => ids.includes(a.id));
  if (elegidas.length !== ids.length) {
    return { ok: false, mensaje: "Alguna factura ya no está abierta: recargá la página." };
  }
  const { errores, total, titular } = validarSeleccionOP(elegidas);
  if (errores.length) return { ok: false, mensaje: errores.join(" · ") };

  try {
    const numero = await prisma.$transaction(async (tx) => {
      const motivo = `App de compras · ${session.user.name}`;
      const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`select cc.proxima_op(${motivo}) as numero`;
      const carga = {
        ordenes: [{
          "N° OP": numero,
          "Proveedor (elegir)": proveedor,
          Estado: "Prevista",
          "Total imputado": total,
          Titular: titular,
        }],
        imputaciones: elegidas.map((a) => ({
          "N° OP": numero,
          "Comprobante (clave)": `${proveedor}|${a.numero}`,
          "Importe imputado": a.libre,
        })),
      };
      const [{ r }] = await tx.$queryRaw<{ r: ResultadoCarga }[]>`
        select cc.cargar_pagos(${JSON.stringify(carga)}::jsonb, 'app') as r`;
      if (r.errores?.length) throw new Rechazo(r.errores.map((e) => e.error).join(" · "));
      if (r.ordenes !== 1 || r.imputaciones !== elegidas.length) {
        throw new Rechazo("La base no grabó todas las facturas de la OP.");
      }
      return numero;
    });

    revalidatePath("/op");
    revalidatePath("/cuenta");
    revalidatePath("/");
    return { ok: true, mensaje: `${numero} reservada`, numero };
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }
}

/**
 * Anula una OP Prevista armada en la app: Estado "Anulada" y cada imputación corregida
 * a 0, todo con cc.cargar_pagos (la app no borra en cc). Las facturas vuelven a quedar
 * libres. Las OP que vienen de ClickUp no se tocan acá: su estado lo sincroniza el
 * plomero y anularlas en la base dejaría la base distinta de ClickUp.
 */
export async function anularOP(numero: string): Promise<ResultadoOP> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") {
    return { ok: false, mensaje: "No tenés permiso para anular OP." };
  }

  const ops = await prisma.$queryRaw<{ estado: string; origen: string }[]>`
    select estado, origen from cc.ordenes_pago where numero = ${numero}`;
  if (!ops.length) return { ok: false, mensaje: "No encontré la OP." };
  if (ops[0].estado !== "Prevista") return { ok: false, mensaje: `La OP está ${ops[0].estado}: solo se anula una Prevista.` };
  if (ops[0].origen !== "app") return { ok: false, mensaje: "Esta OP viene de ClickUp: anulala allá." };

  const imps = await prisma.$queryRaw<{ proveedor: string | null; comprobante: string | null }[]>`
    select c.proveedor_codigo as proveedor, c.numero as comprobante
    from cc.imputaciones i left join cc.comprobantes c on c.id = i.comprobante_id
    where i.op_numero = ${numero}`;
  if (imps.some((i) => !i.comprobante)) return { ok: false, mensaje: "La OP tiene pagos a cuenta: anulala a mano." };

  const carga = {
    ordenes: [{ "N° OP": numero, Estado: "Anulada", "Total imputado": "0" }],
    imputaciones: imps.map((i) => ({
      "N° OP": numero, "Comprobante (clave)": `${i.proveedor}|${i.comprobante}`, "Importe imputado": "0", Corregir: "SI",
    })),
  };
  try {
    await prisma.$transaction(async (tx) => {
      const [{ r }] = await tx.$queryRaw<{ r: ResultadoCarga & { corregidas: number } }[]>`
        select cc.cargar_pagos(${JSON.stringify(carga)}::jsonb, 'app') as r`;
      if (r.errores?.length) throw new Rechazo(r.errores.map((e) => e.error).join(" · "));
      if (r.ordenes !== 1 || r.corregidas !== imps.length) throw new Rechazo("La base no anuló toda la OP.");
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }

  revalidatePath("/op");
  revalidatePath("/cuenta");
  revalidatePath("/");
  return { ok: true, mensaje: `${numero} anulada: sus facturas quedaron libres` };
}
