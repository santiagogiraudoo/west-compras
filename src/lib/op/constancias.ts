/**
 * Fotos y PDF que se pueden dejar como constancia en una OP (app.constancias_op, sql/014).
 * Solo reglas: la consulta está en queries.ts (listarConstancias).
 */
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

/** Valida una constancia antes de guardarla. Devuelve el problema, o null si está bien. */
export function problemaConstancia(archivo: { type: string; size: number } | null): string | null {
  if (!archivo || archivo.size === 0) return "Elegí una foto o un PDF.";
  if (!(TIPOS_CONSTANCIA as readonly string[]).includes(archivo.type)) return "Tiene que ser una foto (JPG, PNG, WEBP) o un PDF.";
  if (archivo.size > MAX_CONSTANCIA) return "Pesa más de 5 MB.";
  return null;
}
