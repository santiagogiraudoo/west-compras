import { prisma } from "@/lib/prisma";

export interface FilaEntrada {
  id: string;
  canal: "app" | "whatsapp" | "mail";
  remitente: string | null;
  remitente_nombre: string | null;
  nombre: string;
  estado: "recibido" | "leido" | "procesado" | "revisar" | "duplicado" | "descartado";
  clase: string | null;
  motivo: string | null;
  proveedor: string | null;
  comprobante_id: string | null;
  comprobante_numero: string | null;
  remito_id: string | null;
  recibido_en: string;
}

/** Lo último que llegó al buzón, lo pendiente primero. */
export async function listarEntrada(limite = 100): Promise<FilaEntrada[]> {
  return prisma.$queryRaw<FilaEntrada[]>`
    select e.id::text, e.canal, e.remitente, e.remitente_nombre, e.nombre, e.estado, e.clase, e.motivo,
      p.razon_social as proveedor, e.comprobante_id::text, c.numero as comprobante_numero, e.remito_id::text,
      to_char(e.recibido_en at time zone 'America/Argentina/Mendoza', 'YYYY-MM-DD HH24:MI') as recibido_en
    from app.entrada e
    left join cc.proveedores p on p.codigo = e.proveedor_codigo
    left join cc.comprobantes c on c.id = e.comprobante_id
    order by (e.estado in ('revisar', 'recibido', 'leido')) desc, e.recibido_en desc
    limit ${limite}`;
}
