import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";

/** Movimiento de un proveedor con West Desarrolladora (solo unidades de la marca). */
export interface MovimientoProveedor {
  codigo: string;
  comprado_90: string;
  pagado_90: string;
  facturas_90: number;
  /** Fecha de la última factura no anulada. */
  ultima: string | null;
  /** Mediana de días entre la factura y su pago, en los últimos 180 días. */
  dias_pago: number | null;
  /** Mediana del plazo pactado (vencimiento − fecha) de esas mismas facturas. */
  plazo: number | null;
}

/**
 * Para la lista de proveedores: cuánto se les compró y pagó en 90 días, cuándo fue la
 * última factura y cuánto se tarda de verdad en pagarles contra el plazo pactado. Las
 * compensaciones no cuentan como pago (no sale plata).
 */
export async function movimientoProveedores(hoy: string): Promise<MovimientoProveedor[]> {
  return prisma.$queryRaw<MovimientoProveedor[]>`
    with c as (
      select c.* from cc.comprobantes c join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
      where c.estado_aprobacion <> 'Anulado'),
    compras as (
      select proveedor_codigo as codigo, sum(total) filter (where fecha >= ${hoy}::date - 90) as comprado_90,
        count(*) filter (where fecha >= ${hoy}::date - 90 and tipo not like 'Nota%')::int as facturas_90, max(fecha) as ultima
      from c group by 1),
    pagos as (
      select c.proveedor_codigo as codigo, c.id, c.fecha, c.vencimiento, i.importe,
        coalesce(o.fecha_salida_caja, o.fecha_op) as pago
      from c join cc.imputaciones i on i.comprobante_id = c.id
      join cc.ordenes_pago o on o.numero = i.op_numero and o.estado = 'Pagada' and coalesce(o.medio_pago, '') <> 'Compensacion'),
    pagado as (
      select codigo, sum(importe) filter (where pago >= ${hoy}::date - 90) as pagado_90,
        percentile_cont(0.5) within group (order by pago - fecha) filter (where pago >= ${hoy}::date - 180 and importe > 0) as dias_pago,
        percentile_cont(0.5) within group (order by vencimiento - fecha) filter (where pago >= ${hoy}::date - 180 and importe > 0 and vencimiento is not null) as plazo
      from pagos group by 1)
    select coalesce(k.codigo, g.codigo) as codigo, coalesce(k.comprado_90, 0)::text as comprado_90, coalesce(g.pagado_90, 0)::text as pagado_90,
      coalesce(k.facturas_90, 0) as facturas_90, k.ultima::text as ultima, round(g.dias_pago)::int as dias_pago, round(g.plazo)::int as plazo
    from compras k full join pagado g on g.codigo = k.codigo`;
}
