/** Lo que se escribe, listo para un ILIKE (sin comodines propios) y solo sus dígitos. */
export function terminos(q: string): { texto: string; digitos: string } {
  const limpio = q.trim().replace(/[\\%_]/g, (c) => `\\${c}`);
  return { texto: `%${limpio}%`, digitos: q.replace(/\D/g, "") };
}
