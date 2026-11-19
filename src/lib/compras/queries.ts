import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";

/**
 * Compras (cc.compras, por app.v_compras): la tercera punta del cruce compra ↔ remito ↔
 * factura. Entran por ClickUp o por el buzón (docs/proyecto/09_flujo_entrada.md). Montos
 * como texto, para no mezclar el Decimal de Prisma con decimal.js.
 */
export interface Compra {
  id: string;
  clave: string;
  nombre: string;
  proveedor_codigo: string | null;
  proveedor: string | null;
  unidad: string | null;
  importe: string | null;
  facturado: string;
  saldo: string | null;
  estado: string;
  pidio: string | null;
  autorizo: string | null;
  fecha: string;
  firmados: number;
  sin_firmar: number;
  /** Lo que le falta a la compra (proveedor, unidad, importe, quién autorizó), o null. */
  falta: string | null;
}

const SELECT_COMPRA = `
  select k.id::text, k.clickup_id as clave, k.nombre, k.proveedor_codigo, p.razon_social as proveedor,
    un.nombre as unidad, k.importe::text, k.facturado::text, k.saldo::text, k.estado, k.pidio, k.autorizo,
    k.fecha::text, k.remitos_firmados::int as firmados, k.remitos_sin_firmar::int as sin_firmar, k.falta
  from app.v_compras k
  left join cc.proveedores p on p.codigo = k.proveedor_codigo
  left join cc.unidades un on un.codigo = k.unidad_codigo`;

/** Las compras de West Desarrolladora (o sin unidad todavía), las abiertas primero. */
export async function listarCompras(limite = 300): Promise<Compra[]> {
  return prisma.$queryRawUnsafe<Compra[]>(`${SELECT_COMPRA}
    where k.estado <> 'descartado' and (un.codigo is null or un.marca = $1)
    order by (k.estado in ('pedido confirmado', 'esperando remito')) desc, k.fecha desc
    limit ${Number(limite)}`, MARCA);
}

export interface RemitoDeCompra {
  id: string;
  numero: string | null;
  fecha: string | null;
  importe: string | null;
  estado: string;
  retiro_por: string | null;
  archivo_link: string | null;
  factura_id: string | null;
  factura: string | null;
}

/** La compra de una factura (por sus remitos) con todos sus remitos y a qué factura fue cada uno. */
export async function compraDeFactura(comprobanteId: bigint): Promise<{ compra: Compra; remitos: RemitoDeCompra[] } | null> {
  const [compra] = await prisma.$queryRawUnsafe<Compra[]>(`${SELECT_COMPRA}
    where k.id in (select rm.compra_id from cc.remitos rm where rm.comprobante_id = $1 and rm.estado <> 'anulado')
    order by k.id limit 1`, comprobanteId);
  if (!compra) return null;
  const remitos = await prisma.$queryRaw<RemitoDeCompra[]>`
    select r.id::text, r.numero, r.fecha::text, r.importe::text, r.estado, r.retiro_por,
      case when r.archivo_link like 'http%' then r.archivo_link end as archivo_link,
      r.comprobante_id::text as factura_id, c.numero as factura
    from cc.remitos r left join cc.comprobantes c on c.id = r.comprobante_id
    where r.compra_id = ${BigInt(compra.id)} and r.estado <> 'anulado'
    order by r.fecha nulls last, r.id`;
  return { compra, remitos };
}
