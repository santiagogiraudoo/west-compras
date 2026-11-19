import Decimal from "decimal.js";
import { prisma } from "@/lib/prisma";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { mensajeBase } from "@/lib/errores-base";
import { leerComprobante } from "@/lib/pagos/leer-comprobante";
import { elegirOPDelPago } from "@/lib/pagos/cotejo";
import { calcularPago, MEDIOS_PAGO, RETENCIONES, type DatosPago } from "./pago";
import { problemasOP } from "./controles";
import { facturasDeOP, listarOPsApp } from "./queries";

/**
 * Registrar el pago de una OP autorizada, para los tres caminos (fase 3): el formulario de
 * Pagar, los comprobantes subidos en lote y lo que llega por el Buzón o WhatsApp. Todo con
 * cc.cargar_pagos; la base vuelve a frenar si la OP no está Autorizada o el total no es la suma.
 */

export class Rechazo extends Error {}

export interface ResultadoCargaPagos {
  ordenes: number;
  imputaciones: number;
  corregidas: number;
  duplicadas: number;
  errores: { error: string }[];
}

/** Las OP de la app escriben en cc solo con cc.cargar_pagos; un error deshace todo. */
export async function cargarPagos(tx: Pick<typeof prisma, "$queryRaw">, carga: object): Promise<ResultadoCargaPagos> {
  const [{ r }] = await tx.$queryRaw<{ r: ResultadoCargaPagos }[]>`
    select cc.cargar_pagos(${JSON.stringify(carga)}::jsonb, 'app') as r`;
  if (r.errores?.length) throw new Rechazo(r.errores.map((e) => mensajeBase(e.error)).join(" · "));
  return r;
}

export interface Comprobante {
  /** El archivo subido (queda en app.comprobantes_pago) o el link a uno que ya está guardado. */
  archivo?: { nombre: string; tipo: string; bytes: Uint8Array };
  link: string;
}

export async function registrarPago(numero: string, datos: DatosPago, comprobante: Comprobante | null, quien: string):
  Promise<{ ok: boolean; mensaje: string }> {
  const [op] = (await listarOPsApp(["Autorizada"])).filter((o) => o.numero === numero);
  if (!op) return { ok: false, mensaje: "La OP no está autorizada para pagar." };
  const faltan = faltantesProveedor(op);
  if (faltan.length) return { ok: false, mensaje: `Antes de pagar completá el alta: falta ${faltan.join(", ")}` };
  // Una compensación (NC contra facturas) no mueve plata: no hay comprobante de pago.
  if (!comprobante && datos.medio !== "Compensacion") return { ok: false, mensaje: "Subí el comprobante o pegá su link." };

  const p = calcularPago(op.total_imputado, { ...datos, comprobante: comprobante?.link ?? "" }, hoyArgentina());
  if (p.errores.length) return { ok: false, mensaje: p.errores.join(" · ") };

  const fila: Record<string, string> = {
    "N° OP": numero, Estado: "Pagada", "Fecha salida de caja": datos.fecha, "Medio de pago": datos.medio, "Neto a transferir": p.neto,
    ...(comprobante ? { "Comprobante (link)": comprobante.link } : {}),
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
      const [ahora] = await tx.$queryRaw<{ total: string }[]>`select total_imputado::text as total from cc.ordenes_pago where numero = ${numero}`;
      if (!ahora || new Decimal(ahora.total).minus(op.total_imputado).abs().gt(0.005)) {
        throw new Rechazo("la OP cambió mientras la pagabas (otro sacó o agregó una factura): recargá y volvé a registrar el pago");
      }
      if (comprobante?.archivo) {
        await tx.$executeRaw`
          insert into app.comprobantes_pago (op_numero, nombre, tipo, archivo, subido_por)
          values (${numero}, ${comprobante.archivo.nombre}, ${comprobante.archivo.tipo}, ${comprobante.archivo.bytes}, ${quien})`;
      }
      const r = await cargarPagos(tx, { ordenes: [fila], imputaciones });
      if (r.ordenes !== 1) throw new Rechazo("La base no grabó el pago.");
    });
  } catch (e) {
    if (e instanceof Rechazo) return { ok: false, mensaje: `La base lo rechazó: ${e.message}` };
    throw e;
  }
  return { ok: true, mensaje: `${numero} pagada` };
}

const base = () => (process.env.APP_URL ?? process.env.AUTH_URL ?? "").replace(/\/$/, "");

export type PagoDesdeEntrada =
  | { tipo: "pagada"; numero: string; mensaje: string }
  | { tipo: "sugerida"; numero: string; mensaje: string }
  | { tipo: "ninguna"; mensaje: string };

/**
 * Un comprobante de pago del Buzón (subido, por WhatsApp o en Pagar): se lee, se busca su OP
 * autorizada y, si coincide exacto (monto y cuenta del proveedor, sin retenciones), se registra
 * el pago solo. Si no, queda a revisar con la OP sugerida. El archivo es el del buzón.
 */
export async function pagoDesdeEntrada(entradaId: string, quien: string): Promise<PagoDesdeEntrada> {
  const [e] = await prisma.$queryRaw<{ tipo: string; archivo: Uint8Array }[]>`
    select tipo, archivo from app.entrada where id = ${BigInt(entradaId)}`;
  if (!e) return { tipo: "ninguna", mensaje: "no existe ese documento" };
  const anotar = async (estado: string, motivo: string | null, resultado: object) => prisma.$executeRaw`
    update app.entrada set clase = 'comprobante_pago', estado = ${estado}, motivo = ${motivo},
      resultado = ${JSON.stringify(resultado)}::jsonb, procesado_en = now() where id = ${BigInt(entradaId)}`;

  const leido = await leerComprobante(Buffer.from(e.archivo), e.tipo);
  if (!leido.ok) { await anotar("revisar", leido.mensaje, { error: leido.mensaje }); return { tipo: "ninguna", mensaje: leido.mensaje }; }
  const l = leido.datos;
  const ops = (await listarOPsApp(["Autorizada"])).map((o) => ({ numero: o.numero, proveedor: o.proveedor_codigo, total: o.total_imputado, cbu: o.cbu, alias: o.alias }));
  const eleccion = elegirOPDelPago(l, ops);
  if (eleccion.tipo === "ninguna") {
    await anotar("revisar", eleccion.motivo, { lectura: l, eleccion });
    return { tipo: "ninguna", mensaje: `No encontré su OP: ${eleccion.motivo}.` };
  }
  const numero = eleccion.op.numero;
  const medio = l.medio && (MEDIOS_PAGO as readonly string[]).includes(l.medio) ? l.medio : "";
  if (eleccion.tipo === "sugerida" || !medio || !l.fecha || (medio !== "Efectivo" && !l.referencia)) {
    const motivo = eleccion.tipo === "sugerida" ? `parece de ${numero}: ${eleccion.motivo}` : `es de ${numero}, pero no se leyó ${!l.fecha ? "la fecha" : !medio ? "el medio" : "la referencia"}`;
    await anotar("revisar", motivo, { lectura: l, eleccion, op: numero });
    return { tipo: "sugerida", numero, mensaje: `Registralo a mano: ${motivo}.` };
  }
  const datos: DatosPago = {
    fecha: l.fecha, medio, referencia: l.referencia ?? "", comprobante: "",
    retenciones: Object.fromEntries(RETENCIONES.map((r) => [r.clave, ""])) as DatosPago["retenciones"],
  };
  const r = await registrarPago(numero, datos, { link: `${base()}/entrada/${entradaId}/archivo` }, quien);
  if (!r.ok) {
    await anotar("revisar", `es de ${numero}, pero no se pudo registrar: ${r.mensaje}`, { lectura: l, op: numero, error: r.mensaje });
    return { tipo: "sugerida", numero, mensaje: r.mensaje };
  }
  await anotar("procesado", null, { lectura: l, op: numero, registrado: true });
  return { tipo: "pagada", numero, mensaje: `${numero} pagada con el comprobante` };
}
