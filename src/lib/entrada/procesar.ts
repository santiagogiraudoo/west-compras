import { createHash } from "node:crypto";
import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { mensajeBase } from "@/lib/errores-base";
import { leerMonto } from "@/lib/montos";
import { normalizarItems, normalizarNumero, tipoComprobante, TIPOS_COMPROBANTE } from "@/lib/facturas/lectura";
import { decidirEntrada, identificarProveedor, type Accion, type LecturaEntrada } from "./decidir";
import { unidadDelTexto } from "./cruce";
import { leerDocumento } from "./leer";

/**
 * El procesador único del buzón (docs/proyecto/09_flujo_entrada.md): registra lo que llega por
 * cualquier canal, lo lee, decide y lo carga en cc solo con las funciones de la base
 * (cargar_nuevos, cargar_items, cargar_remitos, cargar_compras). La cadena compra ↔ remito ↔
 * factura la arma la base por consecuencia (sql/023): acá solo se lee lo que ató.
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

  const comprobanteId = await prisma.$transaction(async (tx) => {
    const [{ r }] = await tx.$queryRaw<{ r: { errores?: { error: string }[] } }[]>`
      select cc.cargar_nuevos(${JSON.stringify([fila_])}::jsonb, 'app') as r`;
    if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
    const [c] = await tx.$queryRaw<{ id: string }[]>`
      select id::text from cc.comprobantes where proveedor_codigo = ${a.proveedor} and numero = ${a.numero}`;
    if (!c) throw new Error("la base no cargó el comprobante");
    if (items.length) {
      const carga = { "Comprobante (clave)": `${a.proveedor} | ${a.numero}`, items };
      const [{ r: ri }] = await tx.$queryRaw<{ r: { items?: number } | null }[]>`
        select cc.cargar_items(${JSON.stringify(carga)}::jsonb, 'app') as r`;
      if (ri?.items !== items.length) throw new Error("la base no cargó todos los ítems");
    }
    return c.id;
  });
  // Al entrar la factura, la base ya ató los remitos que le corresponden (sql/023).
  const cruzados = await remitosDeFactura(comprobanteId);
  await anotar(id, "procesado", null, a.proveedor, { accion: a, comprobanteId, cruzados }, { comprobante: comprobanteId });
  return { ...a, comprobanteId, numero: a.numero, cruzados };
}

/** Los remitos que la base ató a una factura (sql/023, por consecuencia). */
export async function remitosDeFactura(comprobanteId: string): Promise<string[]> {
  const rs = await prisma.$queryRaw<{ id: string; numero: string | null }[]>`
    select id::text, numero from cc.remitos
    where comprobante_id = ${BigInt(comprobanteId)} and estado <> 'anulado' order by fecha nulls last, id`;
  return rs.map((r) => r.numero ?? `remito ${r.id}`);
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
    if (nuevo.duplicado) return { remitoId: String(nuevo.id), duplicado: true };
    // La base ya le dio factura y compra (sql/023). Si la compra no tiene unidad y el remito dice
    // a qué obra fue, se le pone (con cargar_compras, como todo lo que la app escribe en cc).
    const u = unidadDelTexto(rem.destino, await unidades(tx));
    const [k] = await tx.$queryRaw<{ clave: string; unidad: string | null }[]>`
      select k.clickup_id as clave, k.unidad_codigo as unidad from cc.remitos x join cc.compras k on k.id = x.compra_id
      where x.id = ${BigInt(nuevo.id)}`;
    if (u && k && !k.unidad) await guardarCompra(tx, { clave: k.clave, unidad: u, estado: undefined });
    return { remitoId: String(nuevo.id), duplicado: false };
  });
  if (out.duplicado) {
    const motivo = `el remito ${numero} ya estaba cargado`;
    await anotar(id, "duplicado", motivo, a.proveedor, { accion: a, ...out }, { remito: out.remitoId });
    return { tipo: "duplicado", motivo, proveedor: a.proveedor };
  }
  // Al guardar en el buzón lo que el remito cita, la base vuelve a conciliar (sql/023).
  await anotar(id, "procesado", null, a.proveedor, { accion: a, ...out }, { remito: out.remitoId });
  const [x] = await prisma.$queryRaw<{ factura: string | null; compra: string | null; compra_id: string | null }[]>`
    select c.numero as factura, k.nombre as compra, k.id::text as compra_id from cc.remitos r
    left join cc.comprobantes c on c.id = r.comprobante_id left join cc.compras k on k.id = r.compra_id
    where r.id = ${BigInt(out.remitoId)}`;
  if (x?.compra_id) await prisma.$executeRaw`update app.entrada set compra_id = ${BigInt(x.compra_id)} where id = ${BigInt(id)}`;
  return { ...a, remitoId: out.remitoId, numero, cruzados: x?.factura ? [x.factura] : [] };
}

// ── Compras ───────────────────────────────────────────────────────────────────

type Tx = Pick<typeof prisma, "$queryRaw">;
type CargaCompra = Extract<Accion, { tipo: "cargar_compra" }>;

async function unidades(tx: Tx): Promise<{ codigo: string; nombre: string }[]> {
  return tx.$queryRaw`select codigo, nombre from cc.unidades where coalesce(activa, true)`;
}

/**
 * Crea o actualiza una compra con cc.cargar_compras (la función que la base ya tiene para las de
 * ClickUp). Las de la app usan una clave "app:…" en lugar del id de ClickUp. Devuelve su id.
 */
export async function guardarCompra(tx: Tx, c: {
  clave: string; nombre?: string; proveedor?: string; unidad?: string | null; importe?: string | null; paraQue?: string | null;
  pidio?: string | null; autorizo?: string | null; fecha?: string | null; estado?: string;
}): Promise<string> {
  const fila = {
    "ClickUp id": c.clave, Nombre: c.nombre, "Proveedor (elegir)": c.proveedor, Unidad: c.unidad ?? undefined,
    // Como número: cargar_compras lee el texto como monto argentino y "121000.50" sería otra cosa.
    Importe: c.importe != null ? Number(c.importe) : undefined,
    "Para qué": c.paraQue ?? undefined, Pidió: c.pidio ?? undefined, Autorizó: c.autorizo ?? undefined, Fecha: c.fecha ?? undefined,
    Estado: c.estado,
  };
  const [{ r }] = await tx.$queryRaw<{ r: { errores?: { error: string }[] } }[]>`
    select cc.cargar_compras(${JSON.stringify({ compras: [fila] })}::jsonb, 'app') as r`;
  if (r.errores?.length) throw new Error(r.errores.map((x) => x.error).join(" · "));
  const [k] = await tx.$queryRaw<{ id: string }[]>`select id::text from cc.compras where clickup_id = ${c.clave}`;
  if (!k) throw new Error("la base no cargó la compra");
  return k.id;
}

/** Confirmación de compra: la crea; la base le ata los remitos que ya habían llegado (sql/023). */
async function cargarCompra(id: string, l: LecturaEntrada, a: CargaCompra): Promise<Resultado> {
  const c = l.compra!;
  const importe = (() => { try { return c.importe ? leerMonto(c.importe) : null; } catch { return null; } })();
  const numero = c.numero ? normalizarNumero(c.numero) ?? c.numero.trim() : null;
  const compraId = await prisma.$transaction(async (tx) => guardarCompra(tx, {
    clave: `app:entrada-${id}`, nombre: `Pedido ${numero ?? "s/n"}${c.descripcion ? ` · ${c.descripcion}` : ""}`.slice(0, 200),
    proveedor: a.proveedor, unidad: unidadDelTexto(c.destino, await unidades(tx)), importe, paraQue: c.descripcion ?? c.destino,
    pidio: c.pidio, autorizo: c.autorizo, fecha: c.fecha, estado: "pedido confirmado",
  }));
  await anotar(id, "procesado", null, a.proveedor, { accion: a, compraId }, { compra: compraId });
  const remitos = await prisma.$queryRaw<{ numero: string | null; id: string }[]>`
    select id::text, numero from cc.remitos where compra_id = ${BigInt(compraId)} and estado <> 'anulado' order by fecha, id`;
  return { ...a, numero, cruzados: remitos.map((r) => r.numero ?? `remito ${r.id}`) };
}
