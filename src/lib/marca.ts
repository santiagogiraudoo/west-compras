import { prisma } from "@/lib/prisma";

/**
 * La app es solo de West Desarrolladora (Adriano 17/11, docs/proyecto/03_definiciones.md).
 * Qué unidad es de quién lo dice cc.unidades.marca: la app no guarda su propia lista.
 */
export const MARCA = "West Desarrolladora";

/** Códigos de las unidades de West Desarrolladora. */
export async function unidadesDeLaMarca(): Promise<string[]> {
  const unidades = await prisma.unidad.findMany({ where: { marca: MARCA }, select: { codigo: true } });
  return unidades.map((u) => u.codigo);
}
