"use client";

import { Download } from "lucide-react";
import { Button } from "@/components/ui/button";

/**
 * Baja una tabla como CSV para Excel en castellano: separador ";" y coma decimal, con BOM
 * para que respete los acentos. Las columnas `montos` van como número (1234,56).
 */
export function DescargarCSV({ nombre, columnas, filas, montos = [] }: {
  nombre: string; columnas: { k: string; label: string }[]; filas: Record<string, string | number | null>[]; montos?: string[];
}) {
  function bajar() {
    const celda = (k: string, v: string | number | null) => {
      if (v == null) return "";
      const t = montos.includes(k) ? Number(v).toFixed(2).replace(".", ",") : String(v);
      return /[;"\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
    };
    const texto = [columnas.map((c) => c.label).join(";"), ...filas.map((f) => columnas.map((c) => celda(c.k, f[c.k])).join(";"))].join("\r\n");
    const url = URL.createObjectURL(new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `${nombre}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
  return (
    <Button size="sm" variant="outline" onClick={bajar} disabled={filas.length === 0}>
      <Download className="h-4 w-4" /> Bajar para Excel
    </Button>
  );
}
