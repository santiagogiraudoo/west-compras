import { prisma } from "@/lib/prisma";

/** Un gasto de app.v_gastos (sql/012): un renglón pagado, en su propiedad o grupo. */
export interface Gasto {
  op_numero: string;
  fecha: string;
  titular: string | null;
  comprobante_id: string;
  proveedor: string;
  tipo: string;
  factura: string;
  categoria: string | null;
  unidad_codigo: string;
  unidad: string;
  destino: string | null;
  destino_tipo: string | null;
  importe: string;
}

/** Gastos de un mes (YYYY-MM), por fecha de salida de caja. */
export async function gastosDelMes(mes: string): Promise<Gasto[]> {
  return prisma.$queryRaw<Gasto[]>`
    select g.op_numero, g.fecha::text, g.titular, g.comprobante_id::text, p.razon_social as proveedor, g.tipo, g.factura, g.categoria,
      g.unidad_codigo, u.nombre as unidad, g.destino, g.destino_tipo, g.importe::text
    from app.v_gastos g
    join cc.proveedores p on p.codigo = g.proveedor_codigo
    join cc.unidades u on u.codigo = g.unidad_codigo
    where to_char(g.fecha, 'YYYY-MM') = ${mes}
      -- El saldo inicial de la cuenta corriente (unidad "SALDO CTA CTE") no es un gasto.
      and u.nombre not like 'SALDO CTA CTE%'
    order by g.fecha, g.op_numero, g.factura`;
}


/** Lo gastado por mes y categoría desde `desde` (YYYY-MM-DD), para la evolución. */
export async function gastosPorMes(desde: string): Promise<{ mes: string; categoria: string | null; total: string }[]> {
  return prisma.$queryRaw`
    select to_char(g.fecha, 'YYYY-MM') as mes, g.categoria, sum(g.importe)::text as total
    from app.v_gastos g
    join cc.unidades u on u.codigo = g.unidad_codigo
    where g.fecha >= ${desde}::date and u.nombre not like 'SALDO CTA CTE%'
    group by 1, 2`;
}
