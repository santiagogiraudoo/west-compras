import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";

/**
 * Lecturas del Dashboard (solo West Desarrolladora, por cc.unidades.marca). Montos y
 * fechas en texto; las cuentas, en ./calculos. Nada se guarda: todo se deriva de cc.
 */

/** Lo comprado por mes: facturas no anuladas por su fecha (la nota de crédito ya viene negativa). */
export async function compradoPorMes(desde: string): Promise<{ mes: string; total: string }[]> {
  return prisma.$queryRaw`
    select to_char(c.fecha, 'YYYY-MM') as mes, sum(c.total)::text as total
    from cc.comprobantes c join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
    where c.estado_aprobacion <> 'Anulado' and c.fecha >= ${desde}::date
    group by 1`;
}

/** Lo pagado por mes y lo pagado en el período por categoría, unidad y proveedor (app.v_gastos). */
export async function pagadoDesde(desde: string): Promise<{ mes: string; categoria: string | null; unidad: string; proveedor: string; total: string }[]> {
  return prisma.$queryRaw`
    select to_char(g.fecha, 'YYYY-MM') as mes, g.categoria, u.nombre as unidad, p.razon_social as proveedor, sum(g.importe)::text as total
    from app.v_gastos g
    join cc.unidades u on u.codigo = g.unidad_codigo
    join cc.proveedores p on p.codigo = g.proveedor_codigo
    where g.fecha >= ${desde}::date and u.nombre not like 'SALDO CTA CTE%' -- el saldo inicial no es un pago del período
    group by 1, 2, 3, 4`;
}

export interface Tiempos {
  /** Facturas pagadas en los últimos 90 días. */
  pagadas: number;
  /** Mediana de días entre la fecha de la factura y el pago. */
  factura_a_pago: number | null;
  /** Pagadas con plazo pactado (vencen después de emitirse): las únicas donde "en término" dice algo. */
  con_plazo: number;
  /** Mediana de días entre el vencimiento y el pago, con plazo (positivo: tarde). */
  atraso: number | null;
  /** Porcentaje de las pagadas con plazo que salieron en término. */
  en_termino: number | null;
  /** Mediana de días entre la factura y el pago, de las que vencen el día que se emiten. */
  contado_a_pago: number | null;
  /** Mediana de días entre la fecha de la factura y su carga (plomero o lectura con Claude). */
  carga: number | null;
  /** Mediana de días entre que la factura entra a la base y sale la plata. */
  carga_a_pago: number | null;
}

/** Cuánto tarda cada paso, en los últimos 90 días. Medianas: un caso raro no las mueve. */
export async function tiempos(hoy: string): Promise<Tiempos> {
  const [t] = await prisma.$queryRaw<Tiempos[]>`
    with pagos as (
      select c.id, c.fecha, c.vencimiento, c.origen, (c.creado_en at time zone 'America/Argentina/Mendoza')::date as cargada, max(coalesce(o.fecha_salida_caja, o.fecha_op)) as pago
      from cc.comprobantes c
      join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
      join cc.imputaciones i on i.comprobante_id = c.id
      join cc.ordenes_pago o on o.numero = i.op_numero and o.estado = 'Pagada'
      where c.tipo not like 'Nota%'
      group by 1, 2, 3, 4, 5),
    recientes as (select * from pagos where pago >= ${hoy}::date - 90)
    select
      (select count(*)::int from recientes) as pagadas,
      (select percentile_cont(0.5) within group (order by pago - fecha)::int from recientes) as factura_a_pago,
      -- Contado o sin condición de pago: vencen el día que se emiten, así que siempre
      -- "salen tarde". El término se mide solo con plazo pactado; lo otro, en días.
      (select count(*)::int from recientes where vencimiento > fecha) as con_plazo,
      (select percentile_cont(0.5) within group (order by pago - vencimiento)::int from recientes where vencimiento > fecha) as atraso,
      (select round(100.0 * count(*) filter (where pago <= vencimiento) / nullif(count(*), 0))::int from recientes where vencimiento > fecha) as en_termino,
      (select percentile_cont(0.5) within group (order by pago - fecha)::int from recientes where vencimiento is null or vencimiento <= fecha) as contado_a_pago,
      (select percentile_cont(0.5) within group (order by (c.creado_en at time zone 'America/Argentina/Mendoza')::date - c.fecha)::int
        from cc.comprobantes c join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
        where c.origen in ('claude', 'plomero') and c.creado_en >= ${hoy}::date - 90) as carga,
      -- La fecha de la OP de ClickUp es la del pago: se mide desde la carga de la factura.
      (select percentile_cont(0.5) within group (order by pago - cargada)::int from recientes where origen in ('claude', 'plomero')) as carga_a_pago`;
  return t;
}

/** Proveedores sin condición de pago con facturas en los últimos 90 días: sus facturas vencen el día que se emiten. */
export async function sinCondicionDePago(hoy: string): Promise<{ codigo: string; razon_social: string; facturas: number; total: string }[]> {
  return prisma.$queryRaw`
    select p.codigo, p.razon_social, count(*)::int as facturas, sum(c.total)::text as total
    from cc.comprobantes c
    join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
    join cc.proveedores p on p.codigo = c.proveedor_codigo
    where c.estado_aprobacion <> 'Anulado' and c.fecha >= ${hoy}::date - 90 and coalesce(trim(p.condicion_pago), '') = ''
    group by 1, 2 order by 3 desc`;
}

/**
 * Lo ya comprometido: OP pagadas con echeq o cheque cuya salida de caja todavía no llegó
 * (la plata sale ese día). Solo West Desarrolladora, sin compensaciones.
 */
export async function comprometidos(hoy: string): Promise<{ numero: string; fecha: string; neto: string; medio: string | null; proveedor: string }[]> {
  return prisma.$queryRaw`
    select o.numero, o.fecha_salida_caja::text as fecha, coalesce(nullif(o.neto_transferir, 0), o.total_imputado)::text as neto,
      o.medio_pago as medio, p.razon_social as proveedor
    from cc.ordenes_pago o join cc.proveedores p on p.codigo = o.proveedor_codigo
    where o.estado = 'Pagada' and o.fecha_salida_caja >= ${hoy}::date and coalesce(o.medio_pago, '') <> 'Compensacion'
      and exists (select 1 from cc.imputaciones i join cc.comprobantes c on c.id = i.comprobante_id
                  join cc.unidades u on u.codigo = c.unidad_codigo
                  where i.op_numero = o.numero and u.marca = ${MARCA})
    order by o.fecha_salida_caja`;
}
