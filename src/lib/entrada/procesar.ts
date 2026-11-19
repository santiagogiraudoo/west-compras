import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { mensajeBase } from "@/lib/errores-base";
import { leerMonto } from "@/lib/montos";
import { normalizarItems, normalizarNumero, tipoComprobante, TIPOS_COMPROBANTE } from "@/lib/facturas/lectura";
import { decidirEntrada, identificarProveedor, type Accion, type LecturaEntrada } from "./decidir";
import {
  compraDelRemito, facturaDelRemito, numerosEnTexto, remitosDeLaCompra, remitosDeLaFactura, unidadDelTexto,
  type CompraCruce, type FacturaCruce, type RemitoCruce,
} from "./cruce";
import { leerDocumento } from "./leer";

/**
 * El procesador único del buzón (docs/proyecto/09_flujo_entrada.md): registra lo que llega por
 * cualquier canal, lo lee, decide y lo carga en cc solo con las funciones de la base
 * (cargar_nuevos, cargar_items, cargar_remitos, ligar_remito), y cruza remitos con facturas.
 */

export const TIPOS_ARCHIVO = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
const MAX = 10 * 1024 * 1024;

/** Los primeros bytes tienen que corresponder al tipo declarado. */
export function esDelTipo(b: Uint8Array, tipo: string): boolean {
  const empieza = (...x: number[]) => x.every((v, i) => b[i] === v);
  if (tipo === "application/pdf") return empieza(0x25, 0x50, 0x44, 0x46);
  if (tipo === "image/jpeg") return empieza(0xff, 0xd8, 0xff);
  if (tipo === "image/png") return empieza(0x89, 0x50, 0x4e, 0x47);
  if (tipo === "image/webp") return empieza(0x52, 0x49, 0x46, 0x46) && b[8] === 0x57 && b[9] === 0x45;
  return false;
}

export interface Llegada {
  canal: "app" | "whatsapp" | "mail";
  nombre: string;
  tipo: string;
  bytes: Buffer;
  remitente?: string | null;
  remitenteNombre?: string | null;
  mensaje?: string | null;
  externoId?: string | null;
}

/** Guarda lo que llegó. El mismo archivo (o el mismo mensaje) no entra dos veces. */
export async function registrarEntrada(e: Llegada): Promise<{ ok: true; id: string; nuevo: boolean } | { ok: false; mensaje: string }> {
  if (!(TIPOS_ARCHIVO as readonly string[]).includes(e.tipo)) return { ok: false, mensaje: "tiene que ser un PDF o una foto (JPG, PNG o WEBP)" };
  if (e.bytes.length === 0 || e.bytes.length > MAX) return { ok: false, mensaje: "el archivo está vacío o pesa más de 10 MB" };
  if (!esDelTipo(e.bytes, e.tipo)) return { ok: false, mensaje: "el archivo no es un PDF o una foto válida" };
  const sha = createHash("sha256").update(e.bytes).digest("hex");
  const [nuevo] = await prisma.$queryRaw<{ id: string }[]>`
    insert into app.entrada (sha256, canal, externo_id, remitente, remitente_nombre, mensaje, nombre, tipo, archivo)
    values (${sha}, ${e.canal}, ${e.externoId ?? null}, ${e.remitente ?? null}, ${e.remitenteNombre ?? null},
            ${e.mensaje?.slice(0, 2000) ?? null}, ${e.nombre.slice(0, 200) || "documento"}, ${e.tipo}, ${e.bytes})
    on conflict do nothing returning id::text`;
  if (nuevo) return { ok: true, id: nuevo.id, nuevo: true };
  const [ya] = await prisma.$queryRaw<{ id: string }[]>`
    select id::text from app.entrada where sha256 = ${sha} or (canal = ${e.canal} and externo_id = ${e.externoId ?? null}) limit 1`;
  return ya ? { ok: true, id: ya.id, nuevo: false } : { ok: false, mensaje: "no se pudo registrar el archivo" };
}

export type Resultado =
  | { tipo: "error"; motivo: string }
  | (Accion & { comprobanteId?: string; remitoId?: string; numero?: string | null; cruzados?: string[] });

const base = () => (process.env.APP_URL ?? process.env.AUTH_URL ?? "").replace(/\/$/, "");

/** Lee, decide, carga y cruza un documento del buzón. Deja todo anotado en app.entrada. */
export async function procesarEntrada(id: string): Promise<Resultado> {
  const [fila] = await prisma.$queryRaw<{ tipo: string; archivo: Uint8Array; remitente: string | null; mensaje: string | null; canal: string; estado: string }[]>`
    select tipo, archivo, remitente, mensaje, canal, estado from app.entrada where id = ${BigInt(id)}`;
  if (!fila) return { tipo: "error", motivo: "no existe ese documento en el buzón" };

  const leido = await leerDocumento(Buffer.from(fila.archivo), fila.tipo);
  if (!leido.ok) {
    await anotar(id, "revisar", leido.mensaje, null, { error: leido.mensaje });
    return { tipo: "error", motivo: leido.mensaje };
  }
  const l = leido.lectura;
  await prisma.$executeRaw`
    update app.entrada set lectura = ${JSON.stringify(l)}::jsonb, clase = ${l.clase}, estado = 'leido' where id = ${BigInt(id)}`;

  const [proveedores, titulares] = await Promise.all([
    prisma.proveedor.findMany({ where: { activo: true }, select: { codigo: true, cuit: true, telefono: true } }),
    prisma.$queryRaw<{ nombre: string; cuit: string | null }[]>`select nombre, cuit from cc.titulares where activo`,
  ]);
  const ctxBase = { proveedores, titulares, remitente: fila.canal === "whatsapp" ? fila.remitente : null, hoy: hoyArgentina() };
  const prov = identificarProveedor(l.cuit_emisor, ctxBase);
  const existentes = prov.codigo
    ? await prisma.$queryRaw<{ proveedor: string; numero: string }[]>`
        select proveedor_codigo as proveedor, numero from cc.comprobantes where proveedor_codigo = ${prov.codigo}`
    : [];
  const accion = decidirEntrada(l, { ...ctxBase, existentes });

  try {
    if (accion.tipo === "cargar_factura") return await cargarFactura(id, l, accion, fila);
    if (accion.tipo === "cargar_remito") return await cargarRemito(id, l, accion);
    if (accion.tipo === "cargar_compra") return await cargarCompra(id, l, accion);
  } catch (e) {
    const motivo = mensajeBase(e instanceof Error ? e.message : String(e));
    await anotar(id, "revisar", `la base lo rechazó: ${motivo}`, "proveedor" in accion ? accion.proveedor : null, { accion, error: motivo });
    return { tipo: "error", motivo };
  }
  const estado = accion.tipo === "duplicado" ? "duplicado" : accion.tipo === "descartar" ? "descartado" : accion.tipo === "revisar" ? "revisar" : "procesado";
  const motivo = "motivo" in accion ? accion.motivo : null;
  await anotar(id, estado, motivo, "proveedor" in accion ? accion.proveedor : null, { accion });
  return accion;
}

async function anotar(id: string, estado: string, motivo: string | null, proveedor: string | null, resultado: object,
  ids: { comprobante?: string; remito?: string; compra?: string } = {}) {
  await prisma.$executeRaw`
    update app.entrada set estado = ${estado}, motivo = ${motivo}, proveedor_codigo = ${proveedor},
      resultado = ${JSON.stringify(resultado)}::jsonb, procesado_en = now(),
      comprobante_id = ${ids.comprobante ? BigInt(ids.comprobante) : null}, remito_id = ${ids.remito ? BigInt(ids.remito) : null},
      compra_id = ${ids.compra ? BigInt(ids.compra) : null}
    where id = ${BigInt(id)}`;
}

type CargaFactura = Extract<Accion, { tipo: "cargar_factura" }>;
type CargaRemito = Extract<Accion, { tipo: "cargar_remito" }>;

async function cargarFactura(id: string, l: LecturaEntrada, a: CargaFactura, fila: { canal: string; remitente: string | null; mensaje: string | null }): Promise<Resultado> {
  const f = l.factura!;
  const tipo = tipoComprobante(f.tipo, f.letra);
  if (!(TIPOS_COMPROBANTE as readonly string[]).includes(tipo)) {
    await anotar(id, "revisar", `tipo de comprobante desconocido (${tipo})`, a.proveedor, { accion: a });
    return { tipo: "revisar", motivo: `tipo de comprobante desconocido (${tipo})`, proveedor: a.proveedor };
  }
  // La nota de crédito va en negativo en el comprobante; sus ítems, en positivo (contrato de lectura).
  const signo = tipo.startsWith("Nota de Credito") ? -1 : 1;
  const monto = (v: string | null) => (v == null ? "0.00" : new Decimal(leerMonto(v)).abs().times(signo).toFixed(2));
  const its = normalizarItems(f.items ?? []);
  const items = its.ok ? its.items : [];
  const avisos = [...a.avisos, ...(its.ok ? [] : [its.mensaje])];
  const resumen = items.slice(0, 3).map((i) => i.descripcion).join("; ") + (items.length > 3 ? `; y ${items.length - 3} más` : "");
  const pista = fila.mensaje?.trim() ? ` · Mensaje: ${fila.mensaje.trim().slice(0, 200)}` : "";
  const fila_ = {
    Fecha: f.fecha,
    "Proveedor (elegir)": a.proveedor,
    ...(a.titular ? { "Facturado a (elegir)": a.titular } : {}),
    Tipo: tipo,
    "N° comprobante": a.numero,
    Descripcion: `[${fila.canal}${fila.remitente ? ` ${fila.remitente}` : ""}] ${resumen || "comprobante recibido"}${pista} · ⚠️ falta unidad`
      + (avisos.length ? ` · ⚠️ revisar: ${avisos.join("; ")}` : ""),
    Neto: monto(f.neto), IVA: monto(f.iva), "Percepciones / otros": monto(f.percepciones), Total: monto(f.total),
    "Estado aprobacion": "Pendiente",
    ...(f.vencimiento ? { Vencimiento: f.vencimiento } : {}),
    "Archivo / link": `${base()}/entrada/${id}/archivo`,
  };

  const out = await prisma.$transaction(async (tx) => {
    const [{ r }] = await tx.$queryRaw<{ r: { errores?: { error: string }[] } }[]>`
      select cc.cargar_nuevos(${JSON.stringify([fila_])}::jsonb, 'app') as r`;
    if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
    const [c] = await tx.$queryRaw<{ id: string; fecha: string; total: string; descripcion: string | null }[]>`
      select id::text, fecha::text, total::text, descripcion from cc.comprobantes
      where proveedor_codigo = ${a.proveedor} and numero = ${a.numero}`;
    if (!c) throw new Error("la base no cargó el comprobante");
    if (items.length) {
      const carga = { "Comprobante (clave)": `${a.proveedor} | ${a.numero}`, items };
      await tx.$queryRaw`select cc.cargar_items(${JSON.stringify(carga)}::jsonb, 'app')::text as r`;
    }
    const cruce = signo > 0 ? await cruzarFacturaNueva(tx, a.proveedor, c.id) : { cruzados: [], por: null };
    return { comprobanteId: c.id, ...cruce };
  });
  await anotar(id, "procesado", null, a.proveedor, { accion: a, ...out }, { comprobante: out.comprobanteId });
  return { ...a, comprobanteId: out.comprobanteId, numero: a.numero, cruzados: out.cruzados };
}

async function cargarRemito(id: string, l: LecturaEntrada, a: CargaRemito): Promise<Resultado> {
  const rem = l.remito!;
  const numero = rem.numero ? normalizarNumero(rem.numero) ?? rem.numero.trim() : null;
  const importe = (() => { try { return rem.importe ? leerMonto(rem.importe) : null; } catch { return null; } })();
  const carga = { remitos: [{
    proveedor: a.proveedor, numero, fecha: rem.fecha, importe, retiro_por: rem.retira, autorizo: rem.autoriza,
    estado: rem.firmado ? "ok" : "falta", archivo_link: `${base()}/entrada/${id}/archivo`,
  }] };
  const out = await prisma.$transaction(async (tx) => {
    const [{ r }] = await tx.$queryRaw<{ r: { ids: { id: number; duplicado: boolean }[]; errores: { error: string }[] } }[]>`
      select cc.cargar_remitos(${JSON.stringify(carga)}::jsonb, 'app') as r`;
    if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
    const nuevo = r.ids[0];
    if (!nuevo) throw new Error("la base no cargó el remito");
    if (nuevo.duplicado) return { remitoId: String(nuevo.id), duplicado: true, factura: null as string | null, por: null as string | null };
    // La factura que ya estaba: se ata ahora.
    const facturas = await tx.$queryRaw<FacturaCruce[]>`
      select c.id::text, c.numero, c.fecha::text, c.total::text, c.descripcion from cc.comprobantes c
      where c.proveedor_codigo = ${a.proveedor} and c.tipo not ilike 'nota de cr%' and c.estado_aprobacion <> 'Anulado'
        and c.fecha >= current_date - 120
        and not exists (select 1 from cc.remitos r where r.comprobante_id = c.id and r.estado <> 'anulado')`;
    const cruce = facturaDelRemito({ id: String(nuevo.id), numero, fecha: rem.fecha, importe, facturas_citadas: rem.facturas_citadas }, facturas);
    if (cruce) await tx.$executeRaw`select cc.ligar_remito(${BigInt(nuevo.id)}, ${BigInt(cruce.factura.id)})`;
    // La tercera punta: la compra. Si hay una abierta que le corresponde, el remito se ata a ella;
    // si no, el remito crea su compra ("la compra entra con el remito o la confirmación").
    const remCruce = { id: String(nuevo.id), numero, fecha: rem.fecha, importe, facturas_citadas: rem.facturas_citadas };
    const k = compraDelRemito(remCruce, await comprasDe(tx, a.proveedor));
    const unidad = unidadDelTexto(rem.destino, await unidades(tx));
    const compra = k
      ? await guardarCompra(tx, { clave: k.compra.clave, remitos: [nuevo.id], estado: rem.firmado && importe && k.compra.importe && new Decimal(importe).minus(k.compra.importe).abs().lt(1) ? "hecho" : "esperando remito" })
      : await guardarCompra(tx, {
          clave: `app:remito-${nuevo.id}`, nombre: `Remito ${numero ?? "s/n"}${rem.destino ? ` · ${rem.destino}` : ""}`, proveedor: a.proveedor,
          unidad, importe, paraQue: rem.destino, autorizo: rem.autoriza, fecha: rem.fecha, remitos: [nuevo.id],
          estado: rem.firmado ? "hecho" : "esperando remito",
        });
    return {
      remitoId: String(nuevo.id), duplicado: false, factura: cruce?.factura.numero ?? null, por: cruce?.por ?? null,
      compraId: compra, compra: k ? `atado a la compra ${k.compra.clave} (${k.por})` : "compra nueva desde el remito",
    };
  });
  if (out.duplicado) {
    const motivo = `el remito ${numero} ya estaba cargado`;
    await anotar(id, "duplicado", motivo, a.proveedor, { accion: a, ...out }, { remito: out.remitoId });
    return { tipo: "duplicado", motivo, proveedor: a.proveedor };
  }
  await anotar(id, "procesado", null, a.proveedor, { accion: a, ...out }, { remito: out.remitoId });
  return { ...a, remitoId: out.remitoId, numero, cruzados: out.factura ? [out.factura] : [] };
}

/**
 * Una factura que acaba de entrar (por el buzón o por Añadir factura) se lleva los remitos que
 * llegaron antes que ella: se citan, tienen su importe o la suman. Así queda la cadena con la compra.
 */
export async function cruzarFacturaNueva(tx: Pick<typeof prisma, "$queryRaw" | "$executeRaw">, proveedor: string, comprobanteId: string):
  Promise<{ cruzados: string[]; por: string | null }> {
  const [c] = await tx.$queryRaw<{ numero: string; fecha: string; total: string; descripcion: string | null }[]>`
    select numero, fecha::text, total::text, descripcion from cc.comprobantes where id = ${BigInt(comprobanteId)}`;
  if (!c) return { cruzados: [], por: null };
  const cruce = remitosDeLaFactura({ id: comprobanteId, ...c }, await remitosAbiertos(tx, proveedor));
  for (const rem of cruce?.remitos ?? []) await tx.$executeRaw`select cc.ligar_remito(${BigInt(rem.id)}, ${BigInt(comprobanteId)})`;
  return { cruzados: (cruce?.remitos ?? []).map((x) => x.numero ?? `remito ${x.id}`), por: cruce?.por ?? null };
}

/** Remitos del proveedor sin factura, con las facturas que citan (guardadas en su lectura del buzón). */
async function remitosAbiertos(tx: Pick<typeof prisma, "$queryRaw">, proveedor: string): Promise<RemitoCruce[]> {
  const filas = await tx.$queryRaw<{ id: string; numero: string | null; fecha: string | null; importe: string | null; citadas: string[] | null }[]>`
    select r.id::text, r.numero, r.fecha::text, r.importe::text,
      (select array_agg(x) from app.entrada e, jsonb_array_elements_text(e.lectura->'remito'->'facturas_citadas') x
       where e.remito_id = r.id) as citadas
    from cc.remitos r
    where r.proveedor_codigo = ${proveedor} and r.comprobante_id is null and r.estado <> 'anulado'`;
  return filas.map((f) => ({ id: f.id, numero: f.numero, fecha: f.fecha, importe: f.importe, facturas_citadas: f.citadas ?? [] }));
}

// ── Compras ───────────────────────────────────────────────────────────────────

type Tx = Pick<typeof prisma, "$queryRaw">;
type CargaCompra = Extract<Accion, { tipo: "cargar_compra" }>;

/** Compras del proveedor de los últimos 120 días. El número de pedido sale de su nombre. */
async function comprasDe(tx: Tx, proveedor: string): Promise<CompraCruce[]> {
  const filas = await tx.$queryRaw<{ id: string; clave: string; nombre: string; fecha: string; importe: string | null; estado: string }[]>`
    select id::text, clickup_id as clave, nombre, fecha::text, importe::text, estado from cc.compras
    where proveedor_codigo = ${proveedor} and estado <> 'descartado' and fecha >= current_date - 120`;
  return filas.map((f) => ({ id: f.id, clave: f.clave, numero: numerosEnTexto(f.nombre)[0] ?? null, fecha: f.fecha, importe: f.importe, estado: f.estado }));
}

async function unidades(tx: Tx): Promise<{ codigo: string; nombre: string }[]> {
  return tx.$queryRaw`select codigo, nombre from cc.unidades where coalesce(activa, true)`;
}

/**
 * Crea o actualiza una compra con cc.cargar_compras (la función que la base ya tiene para las de
 * ClickUp). Las de la app usan una clave "app:…" en lugar del id de ClickUp. Devuelve su id.
 */
async function guardarCompra(tx: Tx, c: {
  clave: string; nombre?: string; proveedor?: string; unidad?: string | null; importe?: string | null; paraQue?: string | null;
  pidio?: string | null; autorizo?: string | null; fecha?: string | null; estado: string; remitos?: number[];
}): Promise<string> {
  const fila = {
    "ClickUp id": c.clave, Nombre: c.nombre, "Proveedor (elegir)": c.proveedor, Unidad: c.unidad ?? undefined,
    // Como número: cargar_compras lee el texto como monto argentino y "121000.50" sería otra cosa.
    Importe: c.importe != null ? Number(c.importe) : undefined,
    "Para qué": c.paraQue ?? undefined, Pidió: c.pidio ?? undefined, Autorizó: c.autorizo ?? undefined, Fecha: c.fecha ?? undefined,
    Estado: c.estado, Remitos: c.remitos?.map(Number),
  };
  const [{ r }] = await tx.$queryRaw<{ r: { errores?: { error: string }[] } }[]>`
    select cc.cargar_compras(${JSON.stringify({ compras: [fila] })}::jsonb, 'app') as r`;
  if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
  const [k] = await tx.$queryRaw<{ id: string }[]>`select id::text from cc.compras where clickup_id = ${c.clave}`;
  if (!k) throw new Error("la base no cargó la compra");
  return k.id;
}

/** Remitos del proveedor que todavía no tienen compra. */
async function remitosSinCompra(tx: Tx, proveedor: string): Promise<RemitoCruce[]> {
  const filas = await tx.$queryRaw<{ id: string; numero: string | null; fecha: string | null; importe: string | null; citadas: string[] | null }[]>`
    select r.id::text, r.numero, r.fecha::text, r.importe::text,
      (select array_agg(x) from app.entrada e, jsonb_array_elements_text(e.lectura->'remito'->'facturas_citadas') x
       where e.remito_id = r.id) as citadas
    from cc.remitos r
    where r.proveedor_codigo = ${proveedor} and r.compra_id is null and r.estado <> 'anulado'`;
  return filas.map((f) => ({ id: f.id, numero: f.numero, fecha: f.fecha, importe: f.importe, facturas_citadas: f.citadas ?? [] }));
}

/** Confirmación de compra: crea la compra y le ata los remitos que ya habían llegado. */
async function cargarCompra(id: string, l: LecturaEntrada, a: CargaCompra): Promise<Resultado> {
  const c = l.compra!;
  const importe = (() => { try { return c.importe ? leerMonto(c.importe) : null; } catch { return null; } })();
  const numero = c.numero ? normalizarNumero(c.numero) ?? c.numero.trim() : null;
  const out = await prisma.$transaction(async (tx) => {
    const clave = `app:entrada-${id}`;
    const base = { clave, nombre: `Pedido ${numero ?? "s/n"}${c.descripcion ? ` · ${c.descripcion}` : ""}`.slice(0, 200), proveedor: a.proveedor,
      unidad: unidadDelTexto(c.destino, await unidades(tx)), importe, paraQue: c.descripcion ?? c.destino, pidio: c.pidio, autorizo: c.autorizo, fecha: c.fecha };
    const compraId = await guardarCompra(tx, { ...base, estado: "pedido confirmado" });
    const remitos = remitosDeLaCompra({ id: compraId, clave, numero, fecha: c.fecha ?? hoyArgentina(), importe, estado: "pedido confirmado" }, await remitosSinCompra(tx, a.proveedor));
    if (remitos.length) await guardarCompra(tx, { clave, estado: "esperando remito", remitos: remitos.map((x) => Number(x.id)) });
    return { compraId, remitos: remitos.map((x) => x.numero ?? `remito ${x.id}`), unidad: base.unidad };
  });
  await anotar(id, "procesado", null, a.proveedor, { accion: a, ...out }, { compra: out.compraId });
  return { ...a, numero, cruzados: out.remitos };
}

