"use server";

import { revalidatePath } from "next/cache";
import Decimal from "decimal.js";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";

export interface Resultado {
  ok: boolean;
  mensaje: string;
}

const tope = (v: string): string | null | undefined => {
  const t = v.trim();
  if (t === "") return null;
  try {
    const d = new Decimal(t);
    return d.isNegative() ? undefined : d.toFixed(2);
  } catch { return undefined; }
};

/**
 * Quién aprueba una unidad (app.aprobadores). Solo un admin. Los topes se guardan pero
 * todavía no se usan: los define Santiago, en dólar blue.
 */
export async function guardarAprobador(unidad: string, usuarioId: number, topeCompra: string, topeMes: string): Promise<Resultado> {
  const session = await auth();
  if (session?.user?.role !== "admin") return { ok: false, mensaje: "Solo un administrador cambia los aprobadores." };
  const [tc, tm] = [tope(topeCompra), tope(topeMes)];
  if (tc === undefined || tm === undefined) return { ok: false, mensaje: "Los topes tienen que ser números positivos (o vacíos)." };

  const [u, un] = await Promise.all([
    prisma.user.findFirst({ where: { id: usuarioId, active: true, role: { in: ["admin", "operador"] } } }),
    prisma.unidad.findFirst({ where: { codigo: unidad, marca: MARCA } }),
  ]);
  if (!u) return { ok: false, mensaje: "Ese usuario no existe, está inactivo o es de consulta (no puede aprobar)." };
  if (!un) return { ok: false, mensaje: "Esa unidad no es de West Desarrolladora." };

  await prisma.$executeRaw`
    insert into app.aprobadores (unidad_codigo, usuario_id, tope_compra_usd, tope_mes_usd, actualizado_por, actualizado_en)
    values (${unidad}, ${usuarioId}, ${tc}::numeric, ${tm}::numeric, ${session.user.name ?? ""}, now())
    on conflict (unidad_codigo) do update set usuario_id = excluded.usuario_id,
      tope_compra_usd = excluded.tope_compra_usd, tope_mes_usd = excluded.tope_mes_usd,
      actualizado_por = excluded.actualizado_por, actualizado_en = now()`;
  revalidatePath("/configuracion");
  revalidatePath("/aprobar");
  return { ok: true, mensaje: `${un.nombre}: aprueba ${u.name}` };
}
