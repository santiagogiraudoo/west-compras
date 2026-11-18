import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";
import { terminos } from "./terminos";

export type TipoResultado = "proveedor" | "factura" | "op" | "remito" | "unidad";

export interface Resultado {
  tipo: TipoResultado;
  titulo: string;
  sub: string;
  href: string;
}

/**
 * El buscador de arriba: proveedor (nombre, CUIT o código), factura, OP, remito o unidad,
 * de West Desarrolladora. Los números se comparan también solo por sus dígitos, así
 * "8897" encuentra la 00003-00008897 y un CUIT se encuentra con o sin guiones.
 */
export async function buscar(q: string): Promise<Resultado[]> {
  if (q.trim().length < 2) return [];
  const { texto, digitos } = terminos(q);
  const conDigitos = digitos.length >= 3;
  const d = `%${digitos}%`;
  const [proveedores, facturas, ops, remitos, unidades] = await Promise.all([
    prisma.$queryRaw<{ codigo: string; razon_social: string; cuit: string | null; rubro: string | null }[]>`
      select codigo, razon_social, cuit, rubro from cc.proveedores
      where activo and (razon_social ilike ${texto} or codigo ilike ${texto}
        or (${conDigitos} and regexp_replace(coalesce(cuit, ''), '\\D', '', 'g') like ${d}))
      order by razon_social limit 6`,
    prisma.$queryRaw<{ id: string; tipo: string; numero: string; proveedor: string; fecha: string; total: string; estado: string | null }[]>`
      select c.id::text, c.tipo, c.numero, p.razon_social as proveedor, c.fecha::text, c.total::text, c.estado_aprobacion as estado
      from cc.comprobantes c join cc.proveedores p on p.codigo = c.proveedor_codigo
      join cc.unidades u on u.codigo = c.unidad_codigo and u.marca = ${MARCA}
      where c.numero ilike ${texto} or (${conDigitos} and regexp_replace(c.numero, '\\D', '', 'g') like ${d})
      order by c.fecha desc limit 6`,
    prisma.$queryRaw<{ numero: string; proveedor: string; estado: string; total: string; de_app: boolean; proveedor_codigo: string }[]>`
      select o.numero, p.razon_social as proveedor, o.estado, o.total_imputado::text as total, o.proveedor_codigo,
        exists (select 1 from app.ops a where a.op_numero = o.numero) as de_app
      from cc.ordenes_pago o join cc.proveedores p on p.codigo = o.proveedor_codigo
      where o.numero ilike ${texto} or (${conDigitos} and regexp_replace(o.numero, '\\D', '', 'g') like ${d})
      order by o.numero desc limit 5`,
    prisma.$queryRaw<{ numero: string; proveedor: string; proveedor_codigo: string; fecha: string | null; comprobante_id: string | null }[]>`
      select r.numero, p.razon_social as proveedor, r.proveedor_codigo, r.fecha::text, r.comprobante_id::text
      from cc.remitos r join cc.proveedores p on p.codigo = r.proveedor_codigo
      where r.numero ilike ${texto} or (${conDigitos} and regexp_replace(coalesce(r.numero, ''), '\\D', '', 'g') like ${d})
      order by r.fecha desc nulls last limit 5`,
    prisma.$queryRaw<{ codigo: string; nombre: string }[]>`
      select codigo, nombre from cc.unidades
      where marca = ${MARCA} and coalesce(activa, true) and (nombre ilike ${texto} or codigo ilike ${texto})
      order by nombre limit 4`,
  ]);
  const pesos = (v: string) => `$${Number(v).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;
  const fecha = (f: string | null) => (f ? f.split("-").reverse().join("/") : "");
  return [
    ...proveedores.map((p): Resultado => ({ tipo: "proveedor", titulo: p.razon_social, sub: [p.cuit, p.rubro, p.codigo].filter(Boolean).join(" · "), href: `/proveedores/${p.codigo}` })),
    ...facturas.map((f): Resultado => ({ tipo: "factura", titulo: `${f.tipo} ${f.numero}`, sub: `${f.proveedor} · ${fecha(f.fecha)} · ${pesos(f.total)}${f.estado === "Aprobado" ? "" : ` · ${f.estado?.toLowerCase()}`}`, href: `/bandeja/${f.id}` })),
    ...ops.map((o): Resultado => ({ tipo: "op", titulo: o.numero, sub: `${o.proveedor} · ${o.estado} · ${pesos(o.total)}${o.de_app ? "" : " · ClickUp"}`, href: o.de_app ? `/op/${o.numero}` : `/cuenta/${o.proveedor_codigo}` })),
    ...remitos.map((r): Resultado => ({ tipo: "remito", titulo: `Remito ${r.numero}`, sub: `${r.proveedor}${r.fecha ? ` · ${fecha(r.fecha)}` : ""}${r.comprobante_id ? "" : " · sin factura"}`, href: r.comprobante_id ? `/bandeja/${r.comprobante_id}` : `/cuenta/${r.proveedor_codigo}` })),
    ...unidades.map((u): Resultado => ({ tipo: "unidad", titulo: u.nombre, sub: u.codigo, href: `/unidades/${u.codigo}` })),
  ];
}
