import { jsPDF } from "jspdf";
import autoTable from "jspdf-autotable";
import { formatCurrency, formatDate } from "@/lib/utils";
import type { Abierto, Extracto } from "./calculos";

export interface DatosExtractoPdf {
  proveedor: { codigo: string; razon_social: string; cuit: string | null };
  hoy: string;
  extracto: Extracto;
  abiertos: Abierto[];
  resumen: { label: string; v: string }[];
}

const $ = (v: string) => formatCurrency(v, "ARS", { decimals: 2 });
const VERDE: [number, number, number] = [27, 67, 50];

/** Extracto de cuenta corriente en PDF: facturas abiertas arriba, extracto debe/haber abajo. */
export function armarPdfExtracto({ proveedor, hoy, extracto, abiertos, resumen }: DatosExtractoPdf): jsPDF {
  const doc = new jsPDF({ unit: "mm", format: "a4", compress: true });
  doc.setFontSize(14);
  doc.setTextColor(...VERDE);
  doc.text("West Desarrolladora · Cuenta corriente", 14, 16);
  doc.setFontSize(10);
  doc.setTextColor(0);
  doc.text(`${proveedor.razon_social} (${proveedor.codigo})${proveedor.cuit ? ` · CUIT ${proveedor.cuit}` : ""}`, 14, 23);
  doc.text(`Al ${formatDate(hoy)}`, 14, 28);
  doc.text(resumen.map((r) => `${r.label}: ${$(r.v)}`).join("   ·   "), 14, 34);

  const estilo = { styles: { fontSize: 8 }, headStyles: { fillColor: VERDE }, margin: { left: 14, right: 14 } };
  const derecha = { halign: "right" as const };

  if (abiertos.length) {
    autoTable(doc, {
      ...estilo,
      startY: 40,
      head: [["Comprobante", "Unidad", "Fecha", "Vence", "Total", "Falta pagar", "En OP"]],
      body: abiertos.map((a) => [`${a.tipo} ${a.numero}`, a.unidad_codigo ?? "", formatDate(a.fecha),
        formatDate(a.vencimiento), $(a.total), $(a.deuda), a.ops ?? ""]),
      columnStyles: { 4: derecha, 5: derecha },
    });
  }

  const y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? 34;
  autoTable(doc, {
    ...estilo,
    startY: y + 8,
    head: [["Fecha", "Concepto", "Unidad", "Debe", "Haber", "Saldo"]],
    body: [
      ...extracto.lineas.map((l) => [formatDate(l.fecha), l.concepto, l.unidad ?? "",
        Number(l.debe) ? $(l.debe) : "", Number(l.haber) ? $(l.haber) : "", $(l.saldo)]),
      ["", "Totales", "", $(extracto.debe), $(extracto.haber), $(extracto.saldo)],
    ],
    columnStyles: { 3: derecha, 4: derecha, 5: derecha },
  });
  return doc;
}
