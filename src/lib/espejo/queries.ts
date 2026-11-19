import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";
import type { FilaEspejo } from "./calculos";

/**
 * Las OP reales (ClickUp, plomero, histórico) de West Desarrolladora de los últimos `dias`, una
 * fila por factura, con lo que la app necesita para evaluarlas: remitos firmados, su compra y el
 * alta del proveedor. Las facturas salen de las imputaciones (OP pagadas) o de cc.op_cc (las
 * previstas de ClickUp todavía no imputan).
 */
export async function filasEspejo(dias = 45): Promise<FilaEspejo[]> {
  return prisma.$queryRaw<FilaEspejo[]>`
    with ops as (
      select o.* from cc.ordenes_pago o
      where o.origen <> 'app' and o.estado <> 'Anulada' and o.fecha_op >= current_date - ${dias}::int
        and exists (select 1 from cc.v_orden_pago v where v.numero = o.numero and v.marca = ${MARCA})
    ), fac as (
      select i.op_numero, i.comprobante_id from cc.imputaciones i join ops on ops.numero = i.op_numero
      where i.importe <> 0 and i.comprobante_id is not null
      union
      select x.op_numero, substring(x.cc_clickup_id from 9)::bigint from cc.op_cc x join ops on ops.numero = x.op_numero
      where x.cc_clickup_id like 'factura:%'
    )
    select o.numero, o.estado, o.origen, o.fecha_op::text, o.total_imputado::text as total,
      p.razon_social, p.cuit, p.cbu, p.alias, p.cuenta_titular, p.medio_pago_habitual, p.condicion_iva,
      p.telefono, p.rubro, p.condicion_pago,
      c.id::text as factura_id, c.tipo, c.numero as factura, c.total::text as factura_total, c.neto::text as factura_neto,
      c.archivo_link, c.retiro_por, coalesce(r.n, 0)::int as remitos, r.importe::text as remito_importe, kc.compra
    from ops o
    join cc.proveedores p on p.codigo = o.proveedor_codigo
    left join fac on fac.op_numero = o.numero
    left join cc.comprobantes c on c.id = fac.comprobante_id
    left join lateral (
      select count(*) as n, sum(rm.importe) as importe from cc.remitos rm
      where rm.comprobante_id = c.id and rm.estado = 'ok') r on true
    left join lateral (
      select json_build_object('clave', k.clickup_id, 'nombre', k.nombre, 'importe', k.importe::text,
        'facturado', k.facturado::text, 'firmados', k.remitos_firmados, 'sin_firmar', k.remitos_sin_firmar) as compra
      from app.v_compras k
      where k.id in (select rm.compra_id from cc.remitos rm where rm.comprobante_id = c.id and rm.estado <> 'anulado')
      order by k.id limit 1) kc on true
    order by o.fecha_op desc, o.numero desc, c.numero`;
}
