import Decimal from "decimal.js";

/**
 * Controles antes de mandar a aprobar o pagar una OP: lo que pudo cambiar en la base
 * desde que se armó. cc.cargar_pagos ya frena imputar más que el total, pero no ve las
 * facturas anuladas después, ni las que una OP de ClickUp lleva en cc.op_cc (sin
 * imputación hasta que se paga): eso es la alerta "Factura en dos OP", un doble pago.
 */
export interface FacturaEnOP {
  factura: string;
  estado_aprobacion: string | null;
  total: string;
  /** Lo imputado a la factura en todas las OP no anuladas, esta incluida. */
  imputado: string;
  /** OP previstas de ClickUp que la llevan en cc.op_cc, separadas por coma. */
  en_clickup: string | null;
}

/** Cómo se dice el estado de una factura que ya no está aprobada. */
const ESTADO: Record<string, string> = { Anulado: "anulada", Pendiente: "sin aprobar", "Factura de remitos": "agrupada en una factura de remitos" };

/** Margen de centavos, el mismo que el resto de la app. */
const MARGEN = new Decimal("0.5");

/** Lo que frena la OP, una frase por problema. Vacío: se puede seguir. */
export function problemasOP(facturas: FacturaEnOP[]): string[] {
  const out: string[] = [];
  for (const f of facturas) {
    if (f.estado_aprobacion !== "Aprobado") {
      out.push(`La factura ${f.factura} está ${ESTADO[f.estado_aprobacion ?? ""] ?? "sin estado"}: sacala de la OP`);
    }
    if (f.en_clickup) out.push(`La factura ${f.factura} también está en ${f.en_clickup} (ClickUp): se pagaría dos veces`);
    const sobra = new Decimal(f.imputado).minus(f.total);
    if (sobra.gt(MARGEN)) {
      out.push(`A la factura ${f.factura} se le imputa $${sobra.toDecimalPlaces(0).toNumber().toLocaleString("es-AR")} más que su total`);
    }
  }
  return out;
}
