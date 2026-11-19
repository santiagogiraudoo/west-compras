import { Prisma } from "@/generated/prisma/client";
import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";
import { getFakeOffset } from "@/lib/dev/fake-date";
import type { Abierto, Movimiento } from "./calculos";

/** Hoy en Argentina, YYYY-MM-DD (el mismo "hoy" que usa cc.v_alertas). */
export function hoyArgentina(): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Argentina/Mendoza" })
    .format(new Date(Date.now() + getFakeOffset()));
}

/**
 * Facturas aprobadas de West Desarrolladora con algo por pagar, leídas de
 * cc.v_saldo_comprobante. cc.v_deuda_proveedor tiene la misma regla pero no sabe de
 * unidades, así que no se puede filtrar por marca: se suma en `resumirDeuda`.
 * Montos y fechas salen como texto para no mezclar el Decimal de Prisma con decimal.js.
 *
 * Una factura está "en OP" si está imputada en una OP Prevista, o si una OP Prevista de
 * ClickUp la lleva en cc.op_cc ("factura:<id>"): esas OP no tienen imputaciones hasta
 * que se pagan, y sin esto la app dejaría ponerla en otra OP (doble pago; es la alerta
 * "Factura en dos OP" de cc.v_alertas). En ese caso nada de su saldo queda libre.
 */
export async function listarAbiertos(proveedor?: string): Promise<Abierto[]> {
  const filtro = proveedor ? Prisma.sql`and s.proveedor_codigo = ${proveedor}` : Prisma.empty;
  return prisma.$queryRaw<Abierto[]>`
    with en_op as (
      select i.comprobante_id, sum(i.importe) importe, string_agg(o.numero, ', ' order by o.numero) ops
      from cc.imputaciones i join cc.ordenes_pago o on o.numero = i.op_numero
      where o.estado = 'Prevista' and i.comprobante_id is not null
      group by i.comprobante_id),
    en_clickup as (
      select split_part(oc.cc_clickup_id, ':', 2)::bigint as comprobante_id,
        string_agg(distinct o.numero, ', ') ops
      from cc.op_cc oc join cc.ordenes_pago o on o.numero = oc.op_numero
      where o.estado = 'Prevista' and oc.cc_clickup_id ~ '^factura:[0-9]+$'
        and not exists (select 1 from cc.imputaciones i
                        where i.op_numero = o.numero and i.comprobante_id = split_part(oc.cc_clickup_id, ':', 2)::bigint)
      group by 1)
    select s.id::text, s.proveedor_codigo, p.razon_social, s.unidad_codigo, s.facturado_a, s.tipo, s.numero,
      s.fecha::text, s.vencimiento::text, s.total::text,
      (case when k.comprobante_id is null then s.saldo else 0 end)::text as libre,
      (coalesce(x.importe, 0) + case when k.comprobante_id is null then 0 else s.saldo end)::text as en_op,
      nullif(concat_ws(', ', x.ops, k.ops), '') as ops,
      (s.saldo + coalesce(x.importe, 0))::text as deuda
    from cc.v_saldo_comprobante s
    join cc.unidades u on u.codigo = s.unidad_codigo and u.marca = ${MARCA}
    join cc.proveedores p on p.codigo = s.proveedor_codigo
    left join en_op x on x.comprobante_id = s.id
    left join en_clickup k on k.comprobante_id = s.id
    where s.estado_aprobacion = 'Aprobado' and abs(s.saldo + coalesce(x.importe, 0)) > 0.005 ${filtro}
    order by s.vencimiento nulls last, s.fecha`;
}

/**
 * Movimientos de la cuenta de un proveedor (solo West Desarrolladora):
 * - cada comprobante aprobado por su total (la nota de crédito ya viene negativa);
 * - cada OP pagada por lo que imputó, en negativo, a la fecha en que salió la plata.
 *   El pago es del proveedor de la factura imputada (como en cc.v_saldo_comprobante),
 *   aunque la OP diga otro: así el saldo del extracto cierra con el de la vista.
 * Un pago "a cuenta" no tiene factura: es de la marca de su OP (cc.v_orden_pago), y si
 * la OP no tiene ninguna factura se toma como de West Desarrolladora.
 */
export async function listarMovimientos(proveedor: string): Promise<Movimiento[]> {
  return prisma.$queryRaw<Movimiento[]>`
    select c.fecha::text as fecha, c.tipo || ' ' || c.numero as concepto, c.unidad_codigo as unidad,
      c.total::text as importe, 'comprobante' as clase, c.id::text as ref, false as de_app
    from cc.comprobantes c join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
    where c.proveedor_codigo = ${proveedor} and c.estado_aprobacion = 'Aprobado'
    union all
    select coalesce(o.fecha_salida_caja, o.fecha_op)::text,
      -- Una OP que imputa 0 neto aplicó una nota de crédito a facturas: no salió plata.
      case when sum(i.importe) = 0 then 'Compensación ' else 'Pago ' end || o.numero, null,
      (-sum(i.importe))::text, 'pago', o.numero, exists (select 1 from app.ops a where a.op_numero = o.numero)
    from cc.ordenes_pago o
    join cc.imputaciones i on i.op_numero = o.numero
    join cc.v_orden_pago v on v.numero = o.numero
    left join cc.comprobantes c on c.id = i.comprobante_id
    left join cc.unidades u on u.codigo = c.unidad_codigo
    where coalesce(c.proveedor_codigo, o.proveedor_codigo) = ${proveedor} and o.estado = 'Pagada'
      and case when i.comprobante_id is null then coalesce(v.marca, ${MARCA}) else u.marca end = ${MARCA}
    group by o.numero, o.fecha_salida_caja, o.fecha_op`;
}

export interface FilaOP {
  numero: string;
  fecha_op: string;
  estado: string;
  /** Estado que lleva ClickUp (cc.op_estados), si lo hay. */
  estado_clickup: string | null;
  proveedor_codigo: string;
  razon_social: string;
  titular: string | null;
  total_imputado: string;
  origen: string;
  facturas: { tipo: string; numero: string; unidad: string; importe: string; vencimiento: string | null }[];
  /** Imputado a cosas que no son de West Desarrolladora (otras unidades, a cuenta). */
  otras: string;
}

/**
 * OP abiertas (Previstas) de ClickUp que tienen al menos una factura de West
 * Desarrolladora. Las armadas en la app tienen su ciclo propio (src/lib/op/queries.ts).
 */
export async function listarOPAbiertas(): Promise<FilaOP[]> {
  return prisma.$queryRaw<FilaOP[]>`
    select o.numero, o.fecha_op::text, o.estado, e.estado_actual as estado_clickup, o.proveedor_codigo,
      p.razon_social, o.titular, o.total_imputado::text, o.origen,
      coalesce(json_agg(json_build_object('tipo', c.tipo, 'numero', c.numero, 'unidad', c.unidad_codigo,
        'importe', i.importe::text, 'vencimiento', c.vencimiento::text) order by c.fecha)
        filter (where u.marca = ${MARCA}), '[]') as facturas,
      coalesce(sum(i.importe) filter (where u.marca is distinct from ${MARCA}), 0)::text as otras
    from cc.ordenes_pago o
    join cc.proveedores p on p.codigo = o.proveedor_codigo
    join cc.imputaciones i on i.op_numero = o.numero
    left join cc.comprobantes c on c.id = i.comprobante_id
    left join cc.unidades u on u.codigo = c.unidad_codigo
    left join cc.op_estados e on e.op_numero = o.numero
    where o.estado = 'Prevista' and o.origen <> 'app'
    group by o.numero, p.codigo, e.estado_actual
    having bool_or(u.marca = ${MARCA})
    order by o.numero desc`;
}

export interface DetalleFactura {
  id: string;
  archivo_link: string | null;
  descripcion: string | null;
  neto: string;
  iva: string;
  percepciones: string;
  estado: string | null;
  items: { descripcion: string; cantidad: string | null; precio: string | null; subtotal: string | null }[];
  remitos: { numero: string | null; fecha: string | null; retiro_por: string | null; archivo_link: string | null }[];
  ops: { numero: string; estado: string; importe: string; fecha: string | null; de_app: boolean }[];
}

/**
 * Lo que se ve al abrir una factura en la cuenta del proveedor: importes, ítems, remitos
 * y las OP que la llevan (previstas o pagadas), con su PDF. Para varias de una vez.
 */
export async function detallesFacturas(ids: string[]): Promise<Record<string, DetalleFactura>> {
  if (ids.length === 0) return {};
  const filas = await prisma.$queryRaw<DetalleFactura[]>`
    select c.id::text, case when c.archivo_link like 'http%' then c.archivo_link end as archivo_link, c.descripcion,
      c.neto::text, c.iva::text, coalesce(c.percepciones, 0)::text as percepciones, c.estado_aprobacion as estado,
      coalesce((select json_agg(json_build_object('descripcion', it.descripcion, 'cantidad', it.cantidad::text,
        'precio', it.precio_unitario::text, 'subtotal', it.subtotal::text) order by it.orden, it.id)
        from cc.comprobante_items it where it.comprobante_id = c.id), '[]') as items,
      coalesce((select json_agg(json_build_object('numero', r.numero, 'fecha', r.fecha::text, 'retiro_por', r.retiro_por,
        'archivo_link', case when r.archivo_link like 'http%' then r.archivo_link end) order by r.fecha)
        from cc.remitos r where r.comprobante_id = c.id and r.estado = 'ok'), '[]') as remitos,
      coalesce((select json_agg(json_build_object('numero', o.numero, 'estado', o.estado, 'importe', o.importe::text,
        'fecha', coalesce(o.fecha_salida_caja, o.fecha_op)::text, 'de_app', exists (select 1 from app.ops a where a.op_numero = o.numero))
        order by o.numero)
        from (
          select o.numero, o.estado, i.importe, o.fecha_salida_caja, o.fecha_op
          from cc.imputaciones i join cc.ordenes_pago o on o.numero = i.op_numero
          where i.comprobante_id = c.id and i.importe <> 0 and o.estado <> 'Anulada'
          union
          -- Las OP previstas de ClickUp la reservan en cc.op_cc, sin imputación hasta pagarse.
          select o.numero, o.estado, c.total, o.fecha_salida_caja, o.fecha_op
          from cc.op_cc oc join cc.ordenes_pago o on o.numero = oc.op_numero
          where oc.cc_clickup_id = 'factura:' || c.id and o.estado = 'Prevista'
            and not exists (select 1 from cc.imputaciones i2 where i2.op_numero = o.numero and i2.comprobante_id = c.id)) o), '[]') as ops
    from cc.comprobantes c where c.id = any(${ids.map((x) => BigInt(x))})`;
  return Object.fromEntries(filas.map((f) => [f.id, f]));
}
