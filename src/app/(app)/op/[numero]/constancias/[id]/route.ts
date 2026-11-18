import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

/** Una constancia de la OP (app.constancias_op, sql/014), para verla en el navegador. */
export async function GET(_req: Request, { params }: { params: Promise<{ numero: string; id: string }> }) {
  const session = await auth();
  if (!session?.user) return new Response("No autorizado", { status: 401 });
  const { numero, id } = await params;
  if (!/^\d+$/.test(id)) return new Response("No existe", { status: 404 });
  const r = await prisma.$queryRaw<{ nombre: string; tipo: string; archivo: Uint8Array }[]>`
    select nombre, tipo, archivo from app.constancias_op where op_numero = ${decodeURIComponent(numero)} and id = ${Number(id)}`;
  if (!r.length) return new Response("No existe", { status: 404 });
  const nombre = r[0].nombre.replace(/[^\w.\- ]/g, "_");
  return new Response(Buffer.from(r[0].archivo), {
    headers: {
      "Content-Type": r[0].tipo,
      "Content-Disposition": `inline; filename="${nombre}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
