import { conciliar } from "@/lib/entrada/conciliar.server";

/**
 * Corrida diaria del conciliador (vercel.json → crons): ata compra ↔ remito ↔ factura para todo
 * lo abierto, también lo que cargó el plomero. La llama Vercel con Authorization: Bearer
 * CRON_SECRET; sin ese secreto no corre (cualquiera puede pegarle a una URL).
 */
export const maxDuration = 300;

export async function GET(req: Request) {
  const secreto = process.env.CRON_SECRET;
  if (!secreto || req.headers.get("authorization") !== `Bearer ${secreto}`) {
    return new Response("No autorizado", { status: 401 });
  }
  const r = await conciliar({ aplicar: true });
  const hechos = r.acciones.filter((a) => a.hecho).length;
  const errores = r.acciones.filter((a) => a.error).map((a) => `${a.proveedor}: ${a.error}`);
  return Response.json({ proveedores: r.proveedores, acciones: r.acciones.length, hechos, errores: [...new Set(errores)] });
}
