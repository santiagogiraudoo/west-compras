import { prisma } from "@/lib/prisma";

/** Una cosa para hacer: sale de cc.v_alertas o de cc.v_calidad, sin copiarla. */
export interface Pendiente {
  origen: "alerta" | "calidad";
  tipo: string;
  proveedor: string | null;
  detalle: string | null;
}

/**
 * Lo que hay que hacer hoy. La fuente de verdad son las vistas de la base de
 * proveedores (las mismas que usan el tablero y el parte del plomero): la app
 * no recalcula reglas propias, así una alarma se apaga sola cuando se arregla el dato.
 */
export async function listarPendientes(): Promise<Pendiente[]> {
  const [alertas, calidad] = await Promise.all([
    prisma.$queryRaw<{ tipo: string; proveedor: string | null; detalle: string | null }[]>`
      select tipo, proveedor, detalle from cc.v_alertas order by orden, tipo`,
    prisma.$queryRaw<{ problema: string; proveedor_codigo: string | null; detalle: string | null }[]>`
      select problema, proveedor_codigo, detalle from cc.v_calidad order by problema`,
  ]);
  return [
    ...alertas.map((a) => ({ origen: "alerta" as const, tipo: a.tipo, proveedor: a.proveedor, detalle: a.detalle })),
    ...calidad.map((c) => ({ origen: "calidad" as const, tipo: c.problema, proveedor: c.proveedor_codigo, detalle: c.detalle })),
  ];
}
