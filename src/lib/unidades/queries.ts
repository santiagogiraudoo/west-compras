import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";

/**
 * Unidades de negocio de West Desarrolladora (obras, propiedades, locales): lo facturado
 * a cada una, por comprobante (cc.comprobantes.unidad_codigo), sin las anuladas; la nota
 * de crédito resta. El saldo inicial de la cuenta corriente no es una unidad.
 */

export interface ResumenUnidad {
  codigo: string;
  nombre: string;
  destino: string | null;
  comprado_90: string;
  comprado_total: string;
  facturas_90: number;
  proveedores_90: number;
  ultima: string | null;
  top_proveedor: string | null;
}

/** Una fila por unidad activa de la marca, con lo facturado en 90 días y en total. */
export async function resumenUnidades(hoy: string): Promise<ResumenUnidad[]> {
  return prisma.$queryRaw<ResumenUnidad[]>`
    with c as (
      select c.unidad_codigo, c.proveedor_codigo, c.fecha, c.total, c.tipo
      from cc.comprobantes c where c.estado_aprobacion <> 'Anulado'),
    top as (
      select distinct on (c.unidad_codigo) c.unidad_codigo, p.razon_social
      from c join cc.proveedores p on p.codigo = c.proveedor_codigo
      where c.fecha >= ${hoy}::date - 90
      group by c.unidad_codigo, p.razon_social order by c.unidad_codigo, sum(c.total) desc)
    select u.codigo, u.nombre,
      (select string_agg(d.destino, ' · ' order by d.parte desc) from app.unidades_destino d where d.unidad_codigo = u.codigo) as destino,
      coalesce(sum(c.total) filter (where c.fecha >= ${hoy}::date - 90), 0)::text as comprado_90,
      coalesce(sum(c.total), 0)::text as comprado_total,
      (count(*) filter (where c.fecha >= ${hoy}::date - 90 and c.tipo not like 'Nota%'))::int as facturas_90,
      (count(distinct c.proveedor_codigo) filter (where c.fecha >= ${hoy}::date - 90))::int as proveedores_90,
      max(c.fecha)::text as ultima, t.razon_social as top_proveedor
    from cc.unidades u
    left join c on c.unidad_codigo = u.codigo
    left join top t on t.unidad_codigo = u.codigo
    where u.marca = ${MARCA} and coalesce(u.activa, true) and u.nombre not like 'SALDO CTA CTE%'
    group by u.codigo, u.nombre, t.razon_social
    order by coalesce(sum(c.total) filter (where c.fecha >= ${hoy}::date - 90), 0) desc, u.nombre`;
}

export interface MovUnidad {
  id: string;
  fecha: string;
  mes: string;
  proveedor_codigo: string;
  proveedor: string;
  tipo: string;
  numero: string;
  rubro: string | null;
  categoria: string | null;
  total: string;
  estado: string | null;
}

/** Las facturas de una unidad desde `desde`, la más nueva primero. */
export async function movimientosUnidad(codigo: string, desde: string): Promise<MovUnidad[]> {
  return prisma.$queryRaw<MovUnidad[]>`
    select c.id::text, c.fecha::text, to_char(c.fecha, 'YYYY-MM') as mes, c.proveedor_codigo, p.razon_social as proveedor,
      c.tipo, c.numero, c.rubro, c.categoria, c.total::text, c.estado_aprobacion as estado
    from cc.comprobantes c join cc.proveedores p on p.codigo = c.proveedor_codigo
    where c.unidad_codigo = ${codigo} and c.estado_aprobacion <> 'Anulado' and c.fecha >= ${desde}::date
    order by c.fecha desc, c.id desc`;
}

/** La unidad, si es de la marca. */
export async function unidad(codigo: string): Promise<{ codigo: string; nombre: string; destino: string | null } | null> {
  const [u] = await prisma.$queryRaw<{ codigo: string; nombre: string; destino: string | null }[]>`
    select u.codigo, u.nombre,
      (select string_agg(d.destino, ' · ' order by d.parte desc) from app.unidades_destino d where d.unidad_codigo = u.codigo) as destino
    from cc.unidades u where u.codigo = ${codigo} and u.marca = ${MARCA}`;
  return u ?? null;
}
