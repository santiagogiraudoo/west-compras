"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { validarSeleccionOP } from "@/lib/cuenta/calculos";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { problemaConstancia } from "@/lib/op/constancias";
import { leerComprobante, type ResultadoLectura } from "@/lib/pagos/leer-comprobante";
import { calcularPago, RETENCIONES, type DatosPago } from "@/lib/op/pago";
import { aDecidir, aQuitar, aResolver, noCruzaRenglon, SE_DECIDE, SE_DESCARTA, SE_QUITA, SE_SACA, type Decision } from "@/lib/op/estados";
import { DIAS_MISMA_COMPRA, evaluarTope, previosEnOP } from "@/lib/op/topes";
import { dolarBlue } from "@/lib/dolar";
import { estadoOP, facturasDeOP, listarOPsApp } from "@/lib/op/queries";
import { problemasOP } from "@/lib/op/controles";
import { hayLibre, leerMonto, MARGEN_LIBRE } from "@/lib/montos";
import { mensajeBase } from "@/lib/errores-base";

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
  if (r.errores?.length) throw new Rechazo(r.errores.map((e) => mensajeBase(e.error)).join(" · "));
  return r;
}

/**
 * Dentro de la transacción y con la OP bloqueada: la última decisión de cada renglón
 * elegido tiene que seguir siendo la que se vio al elegirlo. Si otro decidió mientras
 * tanto (observó lo que yo iba a aprobar), no se pisa: se pide recargar.
 */
async function mismasDecisiones(
  tx: Pick<typeof prisma, "$queryRaw">, numero: string, lineas: { id: string; unidad: string | null; decision: string | null; numero: string }[],
): Promise<void> {
  const ahora = await tx.$queryRaw<{ id: string; unidad: string | null; decision: string }[]>`
    select comprobante_id::text as id, unidad_codigo as unidad, decision from app.v_aprobacion_linea where op_numero = ${numero}`;
  for (const l of lineas) {
    const d = ahora.find((x) => x.id === l.id && (x.unidad ?? "") === (l.unidad ?? ""))?.decision ?? null;
    if (d !== l.decision) throw new Rechazo(`otro cambió la decisión de ${l.numero} mientras tanto (ahora: ${d ?? "sin decidir"}): recargá`);
  }
}

/**
 * Dentro de la transacción: bloquea la fila de la OP (quien llegue segundo espera) y
 * vuelve a leer su estado. Lo que se miró antes de la transacción pudo cambiar: otro
 * pudo pagarla o descartarla mientras tanto.
 */
async function bloquearOP(tx: Pick<typeof prisma, "$queryRaw">, numero: string, permitidos: string[]): Promise<void> {
  await tx.$queryRaw`select numero from cc.ordenes_pago where numero = ${numero} for update`;
  const [e] = await tx.$queryRaw<{ estado: string }[]>`select estado from app.v_op_estado where op_numero = ${numero}`;
  if (!e || !permitidos.includes(e.estado)) throw new Rechazo(`la OP ya está ${e?.estado ?? "sin estado"}`);
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
export async function reservarOP(proveedor: string, ids: string[], importes: Record<string, string> = {}): Promise<ResultadoOP> {
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

  const libresDe = abiertos.filter((a) => ids.includes(a.id));
  if (libresDe.length !== ids.length) {
    return { ok: false, mensaje: "Alguna factura ya no está abierta: recargá la página." };
  }
  // Pago parcial: se puede pagar menos que lo libre de una factura (lo que queda sigue
  // libre para otra OP), nunca más ni cero. Sin importe, va todo lo libre.
  const elegidas: (typeof libresDe[number] & { libreTotal: string })[] = [];
  for (const a of libresDe) {
    let imp = new Decimal(a.libre);
    if (importes[a.id]) {
      try { imp = new Decimal(leerMonto(importes[a.id])); } catch (e) { return { ok: false, mensaje: `El importe de ${a.numero}: ${e instanceof Error ? e.message : "no es un número"}.` }; }
      if (imp.lte(0)) return { ok: false, mensaje: `El importe de ${a.numero} tiene que ser mayor a cero.` };
      // Menos que el margen de redondeo no es un pago (y validarSeleccionOP lo leería como "ya en otra OP").
      if (!hayLibre(imp)) return { ok: false, mensaje: `El importe de ${a.numero} es menor a $${MARGEN_LIBRE.toLocaleString("es-AR")}: no es un pago.` };
      if (imp.minus(a.libre).gt(0.005)) {
        return { ok: false, mensaje: `A ${a.numero} le quedan libres $${new Decimal(a.libre).toDecimalPlaces(0).toNumber().toLocaleString("es-AR")}: no se puede pagar más.` };
      }
    }
    elegidas.push({ ...a, libre: imp.toFixed(2), libreTotal: a.libre });
  }
  const { errores, total, titular } = validarSeleccionOP(elegidas);
  if (errores.length) return { ok: false, mensaje: errores.join(" · ") };

  try {
    const numero = await prisma.$transaction(async (tx) => {
      // Dos personas armando OP del mismo proveedor a la vez: la segunda espera acá y
      // vuelve a leer lo libre, así no se imputa dos veces la misma factura.
      // $executeRaw: la función devuelve void y $queryRaw no sabe leer ese tipo.
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`armar-op:${proveedor}`}))`;
      const frescos = await listarAbiertos(proveedor);
      for (const a of elegidas) {
        const f = frescos.find((x) => x.id === a.id);
        if (!f || new Decimal(f.libre).minus(a.libreTotal).abs().gt(0.5)) throw new Rechazo(`la factura ${a.numero} cambió mientras armabas la OP: recargá`);
      }
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

/**
 * En armado → A aprobar. Cada renglón le llega a quien aprueba su unidad, salvo el que
 * cruza y queda dentro del tope de su unidad: sale aprobado solo ("se aprueba una sola
 * vez"), con el motivo (US$, tope y cotización) guardado como decisión automática.
 */
export async function enviarAAprobar(numero: string): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso." };
  const op = (await listarOPsApp(["En armado"])).find((o) => o.numero === numero);
  if (!op) return { ok: false, mensaje: "La OP ya no está en armado." };
  if (op.lineas.length === 0) return { ok: false, mensaje: "La OP no tiene facturas con importe: descartala." };
  const frena = problemasOP(await facturasDeOP(prisma, numero));
  if (frena.length) return { ok: false, mensaje: frena.join(" · ") };

  // La cotización se pide antes: es una llamada afuera y no tiene que tener bloqueos tomados.
  const blue = await dolarBlue();
  let autos: { l: (typeof op.lineas)[number]; motivo: string }[] = [];
  let conFirma: string[] = [];

  try {
    await prisma.$transaction(async (tx) => {
      // La OP bloqueada (nadie la descarta mientras tanto) y un bloqueo por unidad: dos OP
      // de la misma unidad mandadas a la vez se evalúan una después de la otra, así la
      // segunda ve lo que aprobó solo la primera y no pasan las dos el tope del mes.
      await bloquearOP(tx, numero, ["En armado"]);
      for (const un of [...new Set(op.lineas.map((l) => l.unidad))].sort()) {
        await tx.$executeRaw`select pg_advisory_xact_lock(hashtext(${`topes:${un}`}))`;
      }
      const contexto = await contextoTopes(tx, numero);
      // Lo que ya suman los renglones anteriores de esta misma OP en la unidad: partir una
      // compra en varias facturas de la misma OP no la deja por debajo del tope.
      const previos = previosEnOP(op.lineas);
      const evaluados = op.lineas.map((l, i) => {
        const c = contexto.find((x) => x.comprobante_id === l.id && x.unidad === l.unidad);
        const r = evaluarTope({
          importe: l.importe,
          acumuladoCompra: new Decimal(c?.acumulado_compra ?? "0").plus(previos[i]).toFixed(2),
          acumuladoMes: new Decimal(c?.acumulado_mes ?? "0").plus(previos[i]).toFixed(2),
          topeCompraUsd: c?.tope_compra_usd ?? null, topeMesUsd: c?.tope_mes_usd ?? null,
          blue: blue?.promedio ?? null, noCruza: noCruzaRenglon(l),
        });
        return { l, ...r, conTope: c?.tope_compra_usd != null };
      });
      autos = evaluados.filter((e) => e.auto);
      // Con tope cargado pero pide firma: se dice por qué, así no parece que el tope no anduvo.
      conFirma = evaluados.filter((e) => !e.auto && e.conTope).map((e) => `${e.l.numero}: ${e.motivo}`);

      const n = await tx.$executeRaw`
        update app.ops set enviada_por = ${u.name}, enviada_en = now() where op_numero = ${numero} and enviada_en is null`;
      if (n !== 1) throw new Rechazo("La OP ya se mandó a aprobar.");
      for (const { l, motivo } of autos) {
        await tx.$executeRaw`
          insert into app.aprobaciones_op (op_numero, comprobante_id, unidad_codigo, decision, motivo, usuario_id, usuario, cotizacion_blue)
          values (${numero}, ${BigInt(l.id)}, ${l.unidad}, 'Aprobada', ${motivo}, ${u.id}, 'Automático por tope', ${blue?.promedio ?? null}::numeric)`;
      }
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: e.message };
    throw e;
  }
  revalidar();
  const solos = autos.length;
  const partes = [
    solos ? `${solos} renglón${solos > 1 ? "es" : ""} aprobado${solos > 1 ? "s" : ""} solo${solos > 1 ? "s" : ""} por tope` : "",
    conFirma.length ? `Piden firma: ${conFirma.join(" · ")}` : "",
  ].filter(Boolean);
  return { ok: true, mensaje: `${numero} mandada a aprobar${partes.length ? `. ${partes.join(". ")}` : ""}` };
}

/**
 * Para los topes de cada renglón de la OP: el tope de su unidad, lo del mismo proveedor y
 * unidad en otras OP vivas con facturas de los últimos días, y lo aprobado este mes en
 * la unidad (otras OP). Montos en pesos, como texto.
 */
async function contextoTopes(tx: Pick<typeof prisma, "$queryRaw">, numero: string) {
  return tx.$queryRaw<{
    comprobante_id: string; unidad: string; tope_compra_usd: string | null; tope_mes_usd: string | null;
    acumulado_compra: string; acumulado_mes: string;
  }[]>`
    select r.comprobante_id::text, r.unidad_codigo as unidad,
      ap.tope_compra_usd::text, ap.tope_mes_usd::text,
      coalesce((
        select sum(r2.importe) from app.v_op_renglones r2
        join app.v_op_estado e2 on e2.op_numero = r2.op_numero and e2.estado <> 'Descartada'
        join cc.comprobantes c2 on c2.id = r2.comprobante_id
        where r2.op_numero <> r.op_numero and r2.unidad_codigo = r.unidad_codigo
          and c2.proveedor_codigo = c.proveedor_codigo
          and abs(c2.fecha - c.fecha) <= ${DIAS_MISMA_COMPRA}), 0)::text as acumulado_compra,
      coalesce((
        select sum(r3.importe) from app.v_op_renglones r3
        join app.v_op_estado e3 on e3.op_numero = r3.op_numero and e3.estado <> 'Descartada'
        join app.v_aprobacion_linea l3 on l3.op_numero = r3.op_numero and l3.comprobante_id = r3.comprobante_id
          and l3.unidad_codigo is not distinct from r3.unidad_codigo and l3.decision = 'Aprobada'
        where r3.op_numero <> r.op_numero and r3.unidad_codigo = r.unidad_codigo
          and date_trunc('month', l3.creado_en at time zone 'America/Argentina/Mendoza')
            = date_trunc('month', now() at time zone 'America/Argentina/Mendoza')), 0)::text as acumulado_mes
    from app.v_op_renglones r
    join cc.comprobantes c on c.id = r.comprobante_id
    left join app.aprobadores ap on ap.unidad_codigo = r.unidad_codigo
    where r.op_numero = ${numero}`;
}

/**
 * Aprobar, observar o bloquear: la decisión va a los renglones de la OP que le tocan a
 * quien decide (el aprobador de su unidad). Con "resolver", un admin aprueba los
 * renglones que otro observó o bloqueó, con comentario: es una acción aparte para que
 * aprobar lo propio nunca pise una observación ajena. Observar, bloquear y resolver piden
 * comentario; un renglón observado o bloqueado frena toda la OP. Se agrega una decisión (vale la
 * última): la historia queda en app.aprobaciones_op.
 */
export async function decidirOP(
  numero: string, decision: Decision, comentario: string, resolver = false, renglon?: { id: string; unidad: string },
): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para aprobar." };
  if (!["Aprobada", "Observada", "Bloqueada"].includes(decision)) return { ok: false, mensaje: "Decisión inválida." };
  if (resolver && decision !== "Aprobada") return { ok: false, mensaje: "Resolver es aprobar lo observado." };
  if ((decision !== "Aprobada" || resolver) && comentario.trim().length < 5) {
    return { ok: false, mensaje: "Escribí un comentario (al menos 5 letras)." };
  }

  const esta = (await listarOPsApp(SE_DECIDE)).find((o) => o.numero === numero);
  if (!esta) return { ok: false, mensaje: "La OP no está para aprobar." };
  // Sin renglón: los propios sin decidir. Con renglón: esa factura sola.
  const mias = resolver ? esta.lineas.filter((l) => aResolver(l, u)) : aDecidir(esta.lineas, u, renglon, decision);
  if (mias.length === 0) {
    return { ok: false, mensaje: resolver ? "No hay renglones observados por otros para resolver."
      : renglon ? "Esa factura no es tuya o está frenada: primero quitá la observación."
      : "No te quedan renglones sin decidir en esta OP." };
  }

  // Con la OP bloqueada y su estado mirado de nuevo: mientras tanto pudo pagarse o descartarse.
  try {
    await prisma.$transaction(async (tx) => {
      await bloquearOP(tx, numero, SE_DECIDE);
      await mismasDecisiones(tx, numero, mias);
      for (const l of mias) {
        await tx.$executeRaw`
          insert into app.aprobaciones_op (op_numero, comprobante_id, unidad_codigo, decision, motivo, usuario_id, usuario)
          values (${numero}, ${BigInt(l.id)}, ${l.unidad}, ${decision}, ${comentario.trim() || null}, ${u.id}, ${u.name})`;
      }
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `No se pudo: ${e.message}` };
    throw e;
  }
  revalidar();
  const n = mias.length;
  // "Aprobada" es la decisión; el renglón es masculino: "1 renglón aprobado".
  const dicho = decision.toLowerCase().replace(/a$/, "o");
  return { ok: true, mensaje: `${numero}: ${n} renglón${n > 1 ? "es" : ""} ${dicho}${n > 1 ? "s" : ""}` };
}

/**
 * Quitar una decisión (observación, bloqueo o aprobación): los renglones decididos que le
 * tocan a quien entra (o todos, si es admin) vuelven a "sin decidir", sin pasar por otro
 * estado. Vale también con la OP Autorizada, mientras no se pagó: así sale de Para pagar.
 * Se agrega una decisión 'Quitada' con su comentario; app.v_aprobacion_linea la saltea (sql/013).
 */
export async function quitarObservacionOP(
  numero: string, comentario: string, cual: "frenadas" | "aprobadas" = "frenadas", renglon?: { id: string; unidad: string },
): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para cambiar la aprobación." };
  if (comentario.trim().length < 5) return { ok: false, mensaje: "Escribí por qué se quita (al menos 5 letras)." };

  const esta = (await listarOPsApp(SE_QUITA)).find((o) => o.numero === numero);
  if (!esta) return { ok: false, mensaje: "La OP ya no se puede cambiar (pagada o descartada)." };
  // Sin renglón: las frenadas o las aprobadas. Con renglón: esa factura sola.
  const frenadas = aQuitar(esta.lineas, u, cual, renglon);
  if (frenadas.length === 0) {
    if (renglon) return { ok: false, mensaje: "Esa factura no tiene una decisión que puedas quitar." };
    return { ok: false, mensaje: cual === "aprobadas" ? "No hay renglones aprobados que puedas quitar." : "No hay renglones observados o bloqueados que puedas quitar." };
  }

  try {
  await prisma.$transaction(async (tx) => {
    await bloquearOP(tx, numero, SE_QUITA);
    await mismasDecisiones(tx, numero, frenadas);
    for (const l of frenadas) await tx.$executeRaw`
      insert into app.aprobaciones_op (op_numero, comprobante_id, unidad_codigo, decision, motivo, usuario_id, usuario)
      values (${numero}, ${BigInt(l.id)}, ${l.unidad}, 'Quitada', ${comentario.trim()}, ${u.id}, ${u.name})`;
  });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `No se pudo: ${e.message}` };
    throw e;
  }
  revalidar();
  const n = frenadas.length;
  const que = renglon ? "se quitó la decisión de la factura" : cual === "aprobadas" ? (n === 1 ? "se quitó la aprobación" : `se quitaron ${n} aprobaciones`) : (n === 1 ? "se quitó la observación" : `se quitaron ${n} observaciones`);
  return { ok: true, mensaje: `${numero}: ${que}; vuelve a esperar decisión` };
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
      await bloquearOP(tx, numero, SE_DESCARTA);
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

/** Los primeros bytes tienen que corresponder al tipo declarado (PDF, JPG o PNG). */
function esDelTipo(b: Uint8Array, tipo: string): boolean {
  const empieza = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (tipo === "application/pdf") return empieza(0x25, 0x50, 0x44, 0x46); // %PDF
  if (tipo === "image/jpeg") return empieza(0xff, 0xd8, 0xff);
  if (tipo === "image/png") return empieza(0x89, 0x50, 0x4e, 0x47);
  if (tipo === "image/webp") return empieza(0x52, 0x49, 0x46, 0x46); // RIFF
  return false;
}

/** La dirección de la app tal como la usa quien paga, para guardar un link que abra desde afuera. */
async function baseUrl(): Promise<string> {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") ? "http" : "https");
  return host ? `${proto}://${host}` : "";
}
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
  const bytes = subido ? new Uint8Array(await subido.arrayBuffer()) : null;
  if (bytes && !esDelTipo(bytes, subido!.type)) return { ok: false, mensaje: "El archivo no es un PDF, JPG o PNG válido." };
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
    "Comprobante (link)": subido ? `${await baseUrl()}/op/${numero}/comprobante` : datos.comprobante.trim(),
  };
  for (const r of RETENCIONES) fila[r.campo] = p.retenciones[r.clave];
  if (datos.referencia.trim()) fila["Referencia bancaria"] = datos.referencia.trim();
  // Las imputaciones van de nuevo, iguales: cargar_pagos las cuenta como ya cargadas.
  // Una factura partida en renglones por unidad es una sola imputación: se suman sus partes.
  const porFactura = new Map<string, Decimal>();
  for (const l of op.lineas) porFactura.set(l.numero, (porFactura.get(l.numero) ?? new Decimal(0)).plus(l.importe));
  const imputaciones = [...porFactura].map(([factura, importe]) => ({
    "N° OP": numero, "Comprobante (clave)": `${op.proveedor_codigo}|${factura}`, "Importe imputado": importe.toFixed(2),
  }));

  try {
    await prisma.$transaction(async (tx) => {
      // Si dos personas pagan la misma OP a la vez, la segunda espera acá y la encuentra Pagada.
      await tx.$queryRaw`select numero from cc.ordenes_pago where numero = ${numero} for update`;
      const [e] = await tx.$queryRaw<{ estado: string }[]>`select estado from app.v_op_estado where op_numero = ${numero}`;
      if (e?.estado !== "Autorizada") throw new Rechazo(`la OP está ${e?.estado ?? "sin estado"}, no Autorizada`);
      // Lo que pudo cambiar desde que se aprobó: factura anulada, la misma en ClickUp, imputada de más.
      const frena = problemasOP(await facturasDeOP(tx, numero));
      if (frena.length) throw new Rechazo(frena.join(" · "));
      // El pago se armó con lo leído antes del bloqueo: si mientras tanto sacaron una
      // factura, el total ya no es el mismo y el neto no cuadraría.
      const [ahora] = await tx.$queryRaw<{ total: string }[]>`select total_imputado::text as total from cc.ordenes_pago where numero = ${numero}`;
      if (!ahora || new Decimal(ahora.total).minus(op.total_imputado).abs().gt(0.005)) {
        throw new Rechazo("la OP cambió mientras la pagabas (otro sacó o agregó una factura): recargá y volvé a registrar el pago");
      }
      if (subido && bytes) {
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

/**
 * Dejar una constancia en la OP: una foto o un PDF, con una nota opcional. Queda en
 * app.constancias_op (sql/014) hasta tener SharePoint. Se agregan, no se borran.
 */
export async function subirConstancia(numero: string, form: FormData): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para subir constancias." };
  const archivo = form.get("archivo");
  const subido = archivo instanceof File ? archivo : null;
  const problema = problemaConstancia(subido);
  if (problema || !subido) return { ok: false, mensaje: problema ?? "Elegí una foto o un PDF." };
  const nota = String(form.get("nota") ?? "").trim().slice(0, 500) || null;

  const existe = await prisma.$queryRaw<{ n: number }[]>`select 1 as n from cc.ordenes_pago where numero = ${numero}`;
  if (!existe.length) return { ok: false, mensaje: "No encontré la OP." };

  const bytes = Buffer.from(await subido.arrayBuffer());
  // Como el comprobante de pago: el tipo declarado tiene que coincidir con el contenido.
  if (!esDelTipo(bytes, subido.type)) return { ok: false, mensaje: "El archivo no es una foto o un PDF válidos." };
  await prisma.$executeRaw`
    insert into app.constancias_op (op_numero, nombre, tipo, archivo, nota, subido_por)
    values (${numero}, ${subido.name.slice(0, 200) || "constancia"}, ${subido.type}, ${bytes}, ${nota}, ${u.name})`;
  revalidatePath(`/op/${numero}`);
  return { ok: true, mensaje: `Constancia guardada en la ${numero}` };
}

/**
 * Lee el comprobante del pago con la API de Claude para precargar "Registrar pago"
 * (monto, fecha, referencia, medio, cuenta de destino). No guarda nada: el archivo se
 * guarda recién al confirmar el pago (pagarOP). Quien paga revisa lo leído.
 */
export async function leerComprobantePago(form: FormData): Promise<ResultadoLectura> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para registrar pagos." };
  const archivo = form.get("archivo");
  if (!(archivo instanceof File) || archivo.size === 0) return { ok: false, mensaje: "Elegí el comprobante." };
  if (!TIPOS_COMPROBANTE.includes(archivo.type)) return { ok: false, mensaje: "El comprobante tiene que ser PDF, JPG o PNG." };
  if (archivo.size > MAX_COMPROBANTE) return { ok: false, mensaje: "El comprobante pesa más de 5 MB." };
  return leerComprobante(Buffer.from(await archivo.arrayBuffer()), archivo.type);
}

/**
 * Sacar una factura de la OP sin descartarla: su imputación pasa a 0 (cc.cargar_pagos,
 * "Corregir") y el total de la OP se recalcula con las que quedan. La factura vuelve a
 * estar libre para otra OP. Queda en la historia como decisión 'Quitada' con el motivo.
 * Si es la única factura, se descarta la OP (descartarOP).
 */
export async function sacarDeOP(numero: string, comprobanteId: string, motivo: string): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para cambiar la OP." };
  if (motivo.trim().length < 5) return { ok: false, mensaje: "Escribí por qué se saca (al menos 5 letras)." };
  const estado = await estadoOP(numero);
  if (!estado) return { ok: false, mensaje: "Esta OP no es de la app: se cambia en ClickUp." };
  if (!SE_SACA.includes(estado)) return { ok: false, mensaje: `La OP está ${estado}: ya no se le pueden sacar facturas.` };

  let salio = "";
  try {
    await prisma.$transaction(async (tx) => {
      await bloquearOP(tx, numero, SE_SACA);
      // Las facturas y el total se leen recién ahora, con la OP bloqueada: si dos sacaban
      // facturas a la vez, cada uno calculaba el total sin ver lo del otro y quedaba un
      // total_imputado que no era la suma (y el pago salía por ese total).
      const imps = await tx.$queryRaw<{ id: string; proveedor: string; numero: string; unidad: string | null; importe: string }[]>`
        select c.id::text, c.proveedor_codigo as proveedor, c.numero, c.unidad_codigo as unidad, i.importe::text
        from cc.imputaciones i join cc.comprobantes c on c.id = i.comprobante_id
        where i.op_numero = ${numero} and i.importe <> 0`;
      const sale = imps.find((i) => i.id === comprobanteId);
      if (!sale) throw new Rechazo("esa factura ya no está en la OP");
      if (imps.length === 1) throw new Rechazo("es la única factura de la OP: descartá la OP");
      const total = imps.filter((i) => i !== sale).reduce((t, i) => t.plus(i.importe), new Decimal(0));
      const r = await cargarPagos(tx, {
        ordenes: [{ "N° OP": numero, "Total imputado": total.toFixed(2) }],
        imputaciones: [{ "N° OP": numero, "Comprobante (clave)": `${sale.proveedor}|${sale.numero}`, "Importe imputado": "0", Corregir: "SI" }],
      });
      if (r.corregidas !== 1) throw new Rechazo("La base no sacó la factura.");
      await tx.$executeRaw`
        insert into app.aprobaciones_op (op_numero, comprobante_id, unidad_codigo, decision, motivo, usuario_id, usuario)
        values (${numero}, ${BigInt(sale.id)}, ${sale.unidad}, 'Quitada', ${`Sacada de la OP: ${motivo.trim()}`}, ${u.id}, ${u.name})`;
      salio = sale.numero;
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }
  revalidar();
  return { ok: true, mensaje: `${numero}: se sacó la ${salio}; quedó libre para otra OP` };
}
