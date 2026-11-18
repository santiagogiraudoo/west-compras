"use client";

import { useState } from "react";
import { ChevronRight } from "lucide-react";

/**
 * Una fila de tabla que se abre: al tocarla muestra debajo su detalle (que viene armado
 * del server). La primera celda lleva la flechita.
 */
export function FilaExpandible({ celdas, detalle, columnas, className }: {
  celdas: React.ReactNode[]; detalle: React.ReactNode; columnas: number; className?: string;
}) {
  const [abierta, setAbierta] = useState(false);
  return (
    <>
      <tr onClick={() => setAbierta((v) => !v)} className={`cursor-pointer hover:bg-[#fafaf7] ${abierta ? "bg-[#fafaf7]" : ""} ${className ?? ""}`}
        aria-expanded={abierta}>
        {celdas.map((c, i) => (
          <td key={i} className="border-b border-[#f2f1ec] px-3 py-2.5 align-top">
            {i === 0 ? (
              <span className="flex items-start gap-1.5">
                <ChevronRight className={`mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground transition-transform ${abierta ? "rotate-90" : ""}`} />
                <span className="min-w-0">{c}</span>
              </span>
            ) : c}
          </td>
        ))}
      </tr>
      {abierta && (
        <tr>
          <td colSpan={columnas} className="border-b border-[#f2f1ec] bg-[#fafaf7] px-6 py-4">{detalle}</td>
        </tr>
      )}
    </>
  );
}
