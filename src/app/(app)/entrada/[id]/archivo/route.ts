import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/**
 * El archivo de un documento del buzón (app.entrada, sql/021). Los comprobantes y remitos que
 * cargó el procesador apuntan acá con su archivo_link mientras no haya SharePoint.
 */
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("No autorizado", { status: 401 });
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("No encontrado", { status: 404 });
  const r = await prisma.$queryRaw<{ nombre: string; tipo: string; archivo: Uint8Array }[]>`
    select nombre, tipo, archivo from app.entrada where id = ${BigInt(id)}`;
  if (!r.length) return new Response("No encontrado", { status: 404 });
  const nombre = r[0].nombre.replace(/[^\w.\- ]/g, "_");
  return new Response(Buffer.from(r[0].archivo), {
    headers: { "Content-Type": r[0].tipo, "Content-Disposition": `inline; filename="${nombre}"`, "X-Content-Type-Options": "nosniff" },
  });
}
