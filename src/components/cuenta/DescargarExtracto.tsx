"use client";

import { useState } from "react";
import { FileDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { DatosExtractoPdf } from "@/lib/cuenta/pdf";

/** Extracto de cuenta corriente en PDF, armado en el navegador con jspdf (a pedido). */
export function DescargarExtracto(datos: DatosExtractoPdf) {
  const [armando, setArmando] = useState(false);

  async function descargar() {
    setArmando(true);
    try {
      // jspdf pesa: se carga recién cuando alguien pide el PDF.
      const { armarPdfExtracto } = await import("@/lib/cuenta/pdf");
      armarPdfExtracto(datos).save(`CC ${datos.proveedor.razon_social} ${datos.hoy}.pdf`);
    } finally {
      setArmando(false);
    }
  }

  return (
    <Button size="sm" variant="outline" onClick={descargar} disabled={armando}>
      <FileDown className="h-4 w-4" /> {armando ? "Armando…" : "Descargar PDF"}
    </Button>
  );
}
