import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * El comprobante de pago subido desde "Para pagar" (app.comprobantes_pago, sql/010).
 * cc.ordenes_pago.comprobante_link apunta acá mientras no haya SharePoint.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ numero: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("No autorizado", { status: 401 });
  const { numero } = await params;
  const r = await prisma.$queryRaw<{ nombre: string; tipo: string; archivo: Uint8Array }[]>`
    select nombre, tipo, archivo from app.comprobantes_pago where op_numero = ${numero}`;
  if (!r.length) return new Response("Sin comprobante", { status: 404 });
  const nombre = r[0].nombre.replace(/[^\w.\- ]/g, "_");
  return new Response(Buffer.from(r[0].archivo), {
    headers: {
      "Content-Type": r[0].tipo,
      "Content-Disposition": `inline; filename="${nombre}"`,
      "X-Content-Type-Options": "nosniff",
    },
  });
}
