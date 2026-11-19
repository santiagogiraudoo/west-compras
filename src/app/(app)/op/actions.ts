"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { listarAbiertos } from "@/lib/cuenta/queries";
import { importeElegido, validarSeleccionOP } from "@/lib/cuenta/calculos";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { problemaConstancia } from "@/lib/op/constancias";
import { leerComprobante, type ResultadoLectura } from "@/lib/pagos/leer-comprobante";
import { RETENCIONES, type DatosPago } from "@/lib/op/pago";
import { aDecidir, aQuitar, aResolver, noCruzaRenglon, SE_DECIDE, SE_DESCARTA, SE_QUITA, SE_SACA, type Decision } from "@/lib/op/estados";
import { DIAS_MISMA_COMPRA, evaluarTope, previosEnOP } from "@/lib/op/topes";
import { dolarBlue } from "@/lib/dolar";
import { estadoOP, facturasDeOP, listarOPsApp } from "@/lib/op/queries";
import { problemasOP } from "@/lib/op/controles";

import { cargarPagos, pagoDesdeEntrada, Rechazo, registrarPago } from "@/lib/op/registrar-pago";
import { enVerde } from "@/lib/op/aprobar";
import { registrarEntrada } from "@/lib/entrada/procesar";

export interface ResultadoOP {
  ok: boolean;
  mensaje: string;
  numero?: string;
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
  // Pago parcial o NC aplicada en parte: menos que lo libre (lo que queda sigue libre para
  // otra OP), nunca más ni cero. Sin importe, va todo lo libre. Misma regla que la pantalla.
  const elegidas: (typeof libresDe[number] & { libreTotal: string })[] = [];
  for (const a of libresDe) {
    const imp = importeElegido(a.libre, a.numero, importes[a.id]);
    if (!imp.ok) return { ok: false, mensaje: `${imp.mensaje}.` };
    elegidas.push({ ...a, libre: imp.importe, libreTotal: a.libre });
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
 * Armar y mandar a aprobar en un paso (fase 2 más simple que ClickUp): reserva la OP y, si salió,
 * la manda a aprobar. Cada paso vuelve a validar todo en el server, como si se hicieran por separado.
 */
export async function reservarYEnviar(proveedor: string, ids: string[], importes: Record<string, string> = {}): Promise<ResultadoOP> {
  const r = await reservarOP(proveedor, ids, importes);
  if (!r.ok || !r.numero) return r;
  const e = await enviarAAprobar(r.numero);
  return e.ok ? e : { ok: true, numero: r.numero, mensaje: `${r.numero} armada, pero no se pudo mandar a aprobar: ${e.mensaje}` };
}

/**
 * El plan de pagos: varias OP de una (una por proveedor y titular), cada una armada y, si se
 * pide, mandada a aprobar. Una que falla no frena a las demás: cada una dice qué pasó.
 */
export async function armarPlan(grupos: { proveedor: string; ids: string[]; importes: Record<string, string> }[], mandar: boolean):
  Promise<{ ok: boolean; mensaje: string; resultados: (ResultadoOP & { proveedor: string })[] }> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para armar OP.", resultados: [] };
  if (!Array.isArray(grupos) || grupos.length === 0) return { ok: false, mensaje: "Elegí al menos una OP.", resultados: [] };
  if (grupos.length > 50) return { ok: false, mensaje: "Son demasiadas OP de una vez: armá de a 50.", resultados: [] };
  const resultados: (ResultadoOP & { proveedor: string })[] = [];
  for (const g of grupos) {
    const r = mandar ? await reservarYEnviar(g.proveedor, g.ids, g.importes) : await reservarOP(g.proveedor, g.ids, g.importes);
    resultados.push({ ...r, proveedor: g.proveedor });
  }
  const bien = resultados.filter((r) => r.ok).length;
  return {
    ok: bien > 0,
    mensaje: bien === grupos.length ? `${bien} OP armada${bien > 1 ? "s" : ""}${mandar ? " y mandada" + (bien > 1 ? "s" : "") + " a aprobar" : ""}`
      : `${bien} de ${grupos.length} OP armadas; las demás dicen por qué no`,
    resultados,
  };
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
  // Una compensación (NC contra facturas) no mueve plata: no hay comprobante de pago.
  if (!subido && !datos.comprobante.trim() && datos.medio !== "Compensacion") return { ok: false, mensaje: "Subí el comprobante o pegá su link." };
  const comprobante = subido && bytes
    ? { archivo: { nombre: subido.name, tipo: subido.type, bytes }, link: `${await baseUrl()}/op/${numero}/comprobante` }
    : datos.comprobante.trim() ? { link: datos.comprobante.trim() } : null;
  const r = await registrarPago(numero, datos, comprobante, u.name);
  if (r.ok) revalidar();
  return r;
}

/**
 * Pagar con los comprobantes (fase 3, más simple que ClickUp): se suben uno o varios y cada uno
 * va al buzón, se lee y busca su OP autorizada; si coincide exacto (monto y cuenta), el pago se
 * registra solo. Si no, queda sugerido para registrarlo a mano.
 */
export async function pagarConComprobantes(form: FormData): Promise<{ ok: boolean; mensaje: string; resultados: { archivo: string; mensaje: string; pagada: boolean }[] }> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para registrar pagos.", resultados: [] };
  const archivos = form.getAll("archivos").filter((f): f is File => f instanceof File && f.size > 0).slice(0, 20);
  if (!archivos.length) return { ok: false, mensaje: "Elegí los comprobantes.", resultados: [] };
  const resultados: { archivo: string; mensaje: string; pagada: boolean }[] = [];
  for (const f of archivos) {
    const reg = await registrarEntrada({ canal: "app", nombre: f.name, tipo: f.type, bytes: Buffer.from(await f.arrayBuffer()), remitente: u.name, remitenteNombre: u.name });
    if (!reg.ok) { resultados.push({ archivo: f.name, mensaje: reg.mensaje, pagada: false }); continue; }
    if (!reg.nuevo) { resultados.push({ archivo: f.name, mensaje: "ese comprobante ya se había subido", pagada: false }); continue; }
    const r = await pagoDesdeEntrada(reg.id, u.name);
    resultados.push({ archivo: f.name, mensaje: r.mensaje, pagada: r.tipo === "pagada" });
  }
  revalidar();
  revalidatePath("/entrada");
  const n = resultados.filter((r) => r.pagada).length;
  return { ok: n > 0, mensaje: `${n} de ${resultados.length} pago${resultados.length > 1 ? "s" : ""} registrado${n === 1 ? "" : "s"} solo${n === 1 ? "" : "s"}`, resultados };
}

/**
 * Aprobar todo lo que está en verde (fase 3): los renglones de quien entra, sin decidir, en OP a
 * aprobar sin frenos, que cruzan compra, remito y factura, con PDF y sin suba de precio. Cada OP
 * con su bloqueo y mirando de nuevo que nadie haya decidido mientras tanto.
 */
export async function aprobarEnVerde(): Promise<ResultadoOP> {
  const u = await usuario();
  if (!u || u.role === "consulta") return { ok: false, mensaje: "No tenés permiso para aprobar." };
  const ops = await listarOPsApp(SE_DECIDE);
  const frenos = Object.fromEntries(await Promise.all(ops.map(async (o) => [o.numero, problemasOP(await facturasDeOP(prisma, o.numero))] as const)));
  const verdes = enVerde(ops, u, frenos);
  if (!verdes.length) return { ok: false, mensaje: "No tenés nada en verde para aprobar." };
  let n = 0;
  const fallas: string[] = [];
  for (const { op, lineas } of verdes) {
    try {
      await prisma.$transaction(async (tx) => {
        await bloquearOP(tx, op.numero, ["A aprobar"]);
        await mismasDecisiones(tx, op.numero, lineas);
        for (const l of lineas) {
          await tx.$executeRaw`
            insert into app.aprobaciones_op (op_numero, comprobante_id, unidad_codigo, decision, motivo, usuario_id, usuario)
            values (${op.numero}, ${BigInt(l.id)}, ${l.unidad}, 'Aprobada', 'En verde: cruzan compra, remito y factura', ${u.id}, ${u.name})`;
        }
      });
      n += lineas.length;
    } catch (e) {
      if (!(e instanceof Rechazo)) throw e;
      fallas.push(`${op.numero}: ${e.message}`);
    }
  }
  revalidar();
  return { ok: n > 0, mensaje: `${n} renglón${n === 1 ? "" : "es"} aprobado${n === 1 ? "" : "s"}${fallas.length ? `; no se pudo: ${fallas.join(" · ")}` : ""}` };
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
