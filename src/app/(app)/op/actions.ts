"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { validarSeleccionOP } from "@/lib/cuenta/calculos";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { calcularPago, RETENCIONES, type DatosPago } from "@/lib/op/pago";
import { decide, SE_DECIDE, SE_DESCARTA, type Decision } from "@/lib/op/estados";
import { estadoOP, listarOPsApp } from "@/lib/op/queries";

export interface ResultadoOP {
  ok: boolean;
  mensaje: string;
  numero?: string;
}

interface ResultadoCarga {
  ordenes: number;
  imputaciones: number;
  corregidas: number;
  duplicadas: number;
  errores: { error: string }[];
}

class Rechazo extends Error {}

/** Las OP de la app escriben en cc solo con cc.cargar_pagos; un error deshace todo. */
async function cargarPagos(tx: Pick<typeof prisma, "$queryRaw">, carga: object): Promise<ResultadoCarga> {
  const [{ r }] = await tx.$queryRaw<{ r: ResultadoCarga }[]>`
    select cc.cargar_pagos(${JSON.stringify(carga)}::jsonb, 'app') as r`;
  if (r.errores?.length) throw new Rechazo(r.errores.map((e) => e.error).join(" · "));
  return r;
}

function revalidar() {
  for (const p of ["/op", "/aprobar", "/pagos", "/cuenta", "/"]) revalidatePath(p);
}

async function usuario() {
  const session = await auth();
  if (!session?.user) return null;
  return { id: (session.user as { id: number }).id, name: session.user.name ?? "", role: session.user.role as string };
}

/**
 * Reserva una OP con las facturas elegidas, cada una por lo que tiene libre. Queda
 * "En armado" (cc: Prevista) hasta que se manda a aprobar. cc.proxima_op da el número
 * y cc.cargar_pagos graba la OP y sus imputaciones (y frena doble pago y cruce de
 * titulares). Todo en una transacción: no queda una OP a medias.
 */
export async function reservarOP(proveedor: string, ids: string[]): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para armar OP." };

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
      const motivo = `App de compras · ${u.name}`;
      const [{ numero }] = await tx.$queryRaw<{ numero: string }[]>`select cc.proxima_op(${motivo}) as numero`;
      const r = await cargarPagos(tx, {
        ordenes: [{ "N° OP": numero, "Proveedor (elegir)": proveedor, Estado: "Prevista", "Total imputado": total, Titular: titular }],
        imputaciones: elegidas.map((a) => ({
          "N° OP": numero, "Comprobante (clave)": `${proveedor}|${a.numero}`, "Importe imputado": a.libre,
        })),
      });
      if (r.ordenes !== 1 || r.imputaciones !== elegidas.length) throw new Rechazo("La base no grabó todas las facturas de la OP.");
      await tx.$executeRaw`insert into app.ops (op_numero, armada_por) values (${numero}, ${u.name})`;
      return numero;
    });
    revalidar();
    return { ok: true, mensaje: `${numero} armada: mandala a aprobar cuando esté lista`, numero };
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }
}

/** En armado → A aprobar. Cada renglón le llega a quien aprueba su unidad. */
export async function enviarAAprobar(numero: string): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso." };
  if ((await estadoOP(numero)) !== "En armado") return { ok: false, mensaje: "La OP ya no está en armado." };
  await prisma.$executeRaw`
    update app.ops set enviada_por = ${u.name}, enviada_en = now() where op_numero = ${numero} and enviada_en is null`;
  revalidar();
  return { ok: true, mensaje: `${numero} mandada a aprobar` };
}

/**
 * Aprobar, observar o bloquear: la decisión va a los renglones de la OP que le tocan a
 * quien decide (el aprobador de su unidad). Observar y bloquear piden comentario; un
 * renglón observado o bloqueado frena toda la OP. Se agrega una decisión (vale la
 * última): la historia queda en app.aprobaciones_op.
 */
export async function decidirOP(numero: string, decision: Decision, comentario: string): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para aprobar." };
  if (!["Aprobada", "Observada", "Bloqueada"].includes(decision)) return { ok: false, mensaje: "Decisión inválida." };
  if (decision !== "Aprobada" && comentario.trim().length < 5) {
    return { ok: false, mensaje: "Escribí un comentario (al menos 5 letras)." };
  }

  const esta = (await listarOPsApp(SE_DECIDE)).find((o) => o.numero === numero);
  if (!esta) return { ok: false, mensaje: "La OP no está para aprobar." };
  const mias = esta.lineas.filter((l) => decide(l, u));
  if (mias.length === 0) return { ok: false, mensaje: "Ningún renglón de esta OP es de una unidad que apruebes vos." };

  await prisma.$transaction(
    mias.map((l) => prisma.$executeRaw`
      insert into app.aprobaciones_op (op_numero, comprobante_id, decision, motivo, usuario_id, usuario)
      values (${numero}, ${BigInt(l.id)}, ${decision}, ${comentario.trim() || null}, ${u.id}, ${u.name})`),
  );
  revalidar();
  const n = mias.length;
  return { ok: true, mensaje: `${numero}: ${n} renglón${n > 1 ? "es" : ""} ${decision.toLowerCase()}${n > 1 ? "s" : ""}` };
}

/**
 * Descartar con motivo: la OP queda Anulada en cc (imputaciones a 0, con
 * cc.cargar_pagos) y sus facturas vuelven a estar libres. El número no se reutiliza.
 */
export async function descartarOP(numero: string, motivo: string): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para descartar OP." };
  if (motivo.trim().length < 5) return { ok: false, mensaje: "Escribí el motivo (al menos 5 letras)." };
  const estado = await estadoOP(numero);
  if (!estado) return { ok: false, mensaje: "Esta OP no es de la app: se descarta en ClickUp." };
  if (!SE_DESCARTA.includes(estado)) return { ok: false, mensaje: `La OP está ${estado}: no se puede descartar.` };

  const imps = await prisma.$queryRaw<{ proveedor: string | null; comprobante: string | null }[]>`
    select c.proveedor_codigo as proveedor, c.numero as comprobante
    from cc.imputaciones i left join cc.comprobantes c on c.id = i.comprobante_id
    where i.op_numero = ${numero}`;
  if (imps.some((i) => !i.comprobante)) return { ok: false, mensaje: "La OP tiene pagos a cuenta: descartala a mano." };

  try {
    await prisma.$transaction(async (tx) => {
      const r = await cargarPagos(tx, {
        ordenes: [{ "N° OP": numero, Estado: "Anulada", "Total imputado": "0" }],
        imputaciones: imps.map((i) => ({
          "N° OP": numero, "Comprobante (clave)": `${i.proveedor}|${i.comprobante}`, "Importe imputado": "0", Corregir: "SI",
        })),
      });
      if (r.ordenes !== 1 || r.corregidas !== imps.length) throw new Rechazo("La base no descartó toda la OP.");
      await tx.$executeRaw`
        update app.ops set descartada_por = ${u.name}, descartada_en = now(), motivo_descarte = ${motivo.trim()}
        where op_numero = ${numero}`;
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }
  revalidar();
  return { ok: true, mensaje: `${numero} descartada: sus facturas quedaron libres` };
}

const TIPOS_COMPROBANTE = ["application/pdf", "image/jpeg", "image/png"];
const MAX_COMPROBANTE = 5 * 1024 * 1024;

/**
 * Registrar el pago de una OP autorizada: pasa a Pagada con fecha, medio, retenciones,
 * neto, referencia, sus imputaciones y el comprobante, todo con cc.cargar_pagos. El
 * comprobante subido queda en app.comprobantes_pago hasta tener SharePoint. La base
 * vuelve a frenar si la OP no está Autorizada (sql/009) o si total − retenciones ≠ neto.
 */
export async function pagarOP(numero: string, form: FormData): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para registrar pagos." };

  const datos: DatosPago = {
    fecha: String(form.get("fecha") ?? ""),
    medio: String(form.get("medio") ?? ""),
    referencia: String(form.get("referencia") ?? ""),
    comprobante: String(form.get("link") ?? ""),
    retenciones: Object.fromEntries(RETENCIONES.map((r) => [r.clave, String(form.get(`ret_${r.clave}`) ?? "")])) as DatosPago["retenciones"],
  };
  const archivo = form.get("archivo");
  const subido = archivo instanceof File && archivo.size > 0 ? archivo : null;
  if (subido && !TIPOS_COMPROBANTE.includes(subido.type)) return { ok: false, mensaje: "El comprobante tiene que ser PDF, JPG o PNG." };
  if (subido && subido.size > MAX_COMPROBANTE) return { ok: false, mensaje: "El comprobante pesa más de 5 MB." };
  if (!subido && !datos.comprobante.trim()) return { ok: false, mensaje: "Subí el comprobante o pegá su link." };

  const [op] = (await listarOPsApp(["Autorizada"])).filter((o) => o.numero === numero);
  if (!op) return { ok: false, mensaje: "La OP no está autorizada para pagar." };
  const faltan = faltantesProveedor(op);
  if (faltan.length) return { ok: false, mensaje: `Antes de pagar completá el alta: falta ${faltan.join(", ")}` };

  const p = calcularPago(op.total_imputado, datos, hoyArgentina());
  if (p.errores.length) return { ok: false, mensaje: p.errores.join(" · ") };

  const fila: Record<string, string> = {
    "N° OP": numero, Estado: "Pagada", "Fecha salida de caja": datos.fecha, "Medio de pago": datos.medio, "Neto a transferir": p.neto,
    "Comprobante (link)": subido ? `/op/${numero}/comprobante` : datos.comprobante.trim(),
  };
  for (const r of RETENCIONES) fila[r.campo] = p.retenciones[r.clave];
  if (datos.referencia.trim()) fila["Referencia bancaria"] = datos.referencia.trim();
  // Las imputaciones van de nuevo, iguales: cargar_pagos las cuenta como ya cargadas.
  const imputaciones = op.lineas.map((l) => ({
    "N° OP": numero, "Comprobante (clave)": `${op.proveedor_codigo}|${l.numero}`, "Importe imputado": l.importe,
  }));

  try {
    await prisma.$transaction(async (tx) => {
      if (subido) {
        const bytes = new Uint8Array(await subido.arrayBuffer());
        await tx.$executeRaw`
          insert into app.comprobantes_pago (op_numero, nombre, tipo, archivo, subido_por)
          values (${numero}, ${subido.name}, ${subido.type}, ${bytes}, ${u.name})`;
      }
      const r = await cargarPagos(tx, { ordenes: [fila], imputaciones });
      if (r.ordenes !== 1) throw new Rechazo("La base no grabó el pago.");
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }
  revalidar();
  return { ok: true, mensaje: `${numero} pagada` };
}
