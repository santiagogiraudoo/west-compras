import { prisma } from "@/lib/prisma";

/** Fotos y PDF que se pueden dejar como constancia en una OP (app.constancias_op, sql/014). */
export const TIPOS_CONSTANCIA = ["application/pdf", "image/jpeg", "image/png", "image/webp"] as const;
export const MAX_CONSTANCIA = 5 * 1024 * 1024;

export interface Constancia {
  id: number;
  nombre: string;
  tipo: string;
  nota: string | null;
  subido_por: string;
  subido_en: string;
  tamano: number;
}

/** Las constancias de una OP, sin el archivo (se ve por su link). */
export async function listarConstancias(numero: string): Promise<Constancia[]> {
  return prisma.$queryRaw<Constancia[]>`
    select id, nombre, tipo, nota, subido_por,
      to_char(subido_en at time zone 'America/Argentina/Mendoza', 'DD/MM/YYYY HH24:MI') as subido_en,
      octet_length(archivo)::int as tamano
    from app.constancias_op where op_numero = ${numero}
    order by subido_en, id`;
}

/** Valida una constancia antes de guardarla. Devuelve el problema, o null si está bien. */
export function problemaConstancia(archivo: { type: string; size: number } | null): string | null {
  if (!archivo || archivo.size === 0) return "Elegí una foto o un PDF.";
  if (!(TIPOS_CONSTANCIA as readonly string[]).includes(archivo.type)) return "Tiene que ser una foto (JPG, PNG, WEBP) o un PDF.";
  if (archivo.size > MAX_CONSTANCIA) return "Pesa más de 5 MB.";
  return null;
}
