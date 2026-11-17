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
 */
export async function listarAbiertos(proveedor?: string): Promise<Abierto[]> {
  const filtro = proveedor ? Prisma.sql`and s.proveedor_codigo = ${proveedor}` : Prisma.empty;
  return prisma.$queryRaw<Abierto[]>`
    with en_op as (
      select i.comprobante_id, sum(i.importe) importe, string_agg(o.numero, ', ' order by o.numero) ops
      from cc.imputaciones i join cc.ordenes_pago o on o.numero = i.op_numero
      where o.estado = 'Prevista' and i.comprobante_id is not null
      group by i.comprobante_id)
    select s.id::text, s.proveedor_codigo, p.razon_social, s.unidad_codigo, s.facturado_a, s.tipo, s.numero,
      s.fecha::text, s.vencimiento::text, s.total::text, s.saldo::text as libre,
      coalesce(x.importe, 0)::text as en_op, x.ops, (s.saldo + coalesce(x.importe, 0))::text as deuda
    from cc.v_saldo_comprobante s
    join cc.unidades u on u.codigo = s.unidad_codigo and u.marca = ${MARCA}
    join cc.proveedores p on p.codigo = s.proveedor_codigo
    left join en_op x on x.comprobante_id = s.id
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
      c.total::text as importe, 'comprobante' as clase
    from cc.comprobantes c join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
    where c.proveedor_codigo = ${proveedor} and c.estado_aprobacion = 'Aprobado'
    union all
    select coalesce(o.fecha_salida_caja, o.fecha_op)::text, 'Pago ' || o.numero, null,
      (-sum(i.importe))::text, 'pago'
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

/** OP abiertas (Previstas) que tienen al menos una factura de West Desarrolladora. */
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
    where o.estado = 'Prevista'
    group by o.numero, p.razon_social, e.estado_actual
    having bool_or(u.marca = ${MARCA})
    order by o.numero desc`;
}
