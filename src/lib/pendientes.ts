import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";

/** Una cosa para hacer: sale de cc.v_alertas o de cc.v_calidad, sin copiarla. */
export interface Pendiente {
  origen: "alerta" | "calidad" | "op" | "control";
  tipo: string;
  proveedor: string | null;
  detalle: string | null;
  /** Dónde se resuelve, si es algo de la app. */
  href?: string;
}

/**
 * Lo que hay que hacer hoy. La fuente de verdad son las vistas de la base de
 * proveedores (las mismas que usan el tablero y el parte del plomero): la app
 * no recalcula reglas propias, así una alarma se apaga sola cuando se arregla el dato.
 *
 * Solo West Desarrolladora: cada alerta apunta a algo por su clave (en v_alertas el
 * último tramo del id: "nc|PR-001|0001-123" → "0001-123"). Si apunta a una factura o a
 * una OP de otra marca, no se muestra. Las de un proveedor (falta CBU, sin CUIT) se
 * muestran: el proveedor es el mismo para las dos marcas.
 */
export async function listarPendientes(): Promise<Pendiente[]> {
  const filas = await prisma.$queryRaw<(Pendiente & { orden: number })[]>`
    with p as (
      select 'alerta' as origen, tipo, codigo as prov, proveedor, detalle, orden,
        split_part(id, '|', -1) as ref
      from cc.v_alertas
      union all
      select 'calidad', problema, proveedor_codigo, proveedor_codigo, detalle, 100, clave
      from cc.v_calidad
      union all
      -- Lo que no cierra en las OP de la app (sql/015): va primero, es un error.
      select 'control', control, proveedor_codigo, proveedor_codigo, op_numero || ': ' || detalle, 0, op_numero
      from app.v_controles)
    select origen, tipo, proveedor, detalle, orden from p
    where not exists (
        select 1 from cc.comprobantes c join cc.unidades u on u.codigo = c.unidad_codigo
        where c.proveedor_codigo = p.prov and c.numero = p.ref and u.marca <> ${MARCA})
      and not exists (select 1 from cc.v_orden_pago v where v.numero = p.ref and v.marca <> ${MARCA})
    order by orden, tipo`;
  return filas.map(({ origen, tipo, proveedor, detalle }) => ({ origen, tipo, proveedor, detalle }));
}
