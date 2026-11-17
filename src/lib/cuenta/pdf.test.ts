import { writeFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { armarExtracto } from "./calculos";
import { armarPdfExtracto } from "./pdf";

describe("armarPdfExtracto", () => {
  it("arma un PDF con facturas abiertas y extracto, aunque sean muchas páginas", () => {
    const movs = Array.from({ length: 120 }, (_, i) => ({
      fecha: `2026-${String(1 + (i % 11)).padStart(2, "0")}-10`, concepto: `Factura A 0003-${i}`,
      unidad: "UN-03", importe: i % 5 === 0 ? "-1000.50" : "2500.25", clase: "comprobante" as const,
    }));
    const doc = armarPdfExtracto({
      proveedor: { codigo: "PR-004", razon_social: "Defer", cuit: "30-70918981-2" },
      hoy: "2026-11-17",
      extracto: armarExtracto(movs),
      abiertos: [{
        id: "1", proveedor_codigo: "PR-004", razon_social: "Defer", unidad_codigo: "UN-03", facturado_a: "Giraudo",
        tipo: "Factura A", numero: "0003-1", fecha: "2026-11-02", vencimiento: "2026-11-12", total: "450993.31",
        libre: "450993.31", en_op: "0", ops: null, deuda: "450993.31",
      }],
      resumen: [{ label: "Saldo", v: "1234567.89" }],
    });
    expect(doc.getNumberOfPages()).toBeGreaterThan(1);
    if (process.env.PDF_MUESTRA) writeFileSync(process.env.PDF_MUESTRA, Buffer.from(doc.output("arraybuffer")));
  });
});
