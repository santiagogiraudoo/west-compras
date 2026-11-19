import { decide, noCruzaRenglon, type LineaAprobacion } from "./estados";

/**
 * Lo que quien aprueba puede firmar de un toque (fase 3, más simple que ClickUp): sus renglones
 * sin decidir, en OP a aprobar sin frenos, que cruzan compra, remito y factura, tienen PDF y no
 * están más caros que la última compra. Lo demás se mira uno por uno. Puro.
 */
export function enVerde<O extends { numero: string; estado: string; lineas: L[] }, L extends LineaAprobacion>(
  ops: O[], usuario: { id: number; role: string }, frenos: Record<string, string[]>,
): { op: O; lineas: L[] }[] {
  return ops
    .filter((o) => o.estado === "A aprobar" && !(frenos[o.numero]?.length))
    .map((op) => ({ op, lineas: op.lineas.filter((l) => decide(l, usuario) && !l.decision && noCruzaRenglon(l).length === 0) }))
    .filter((x) => x.lineas.length > 0);
}
