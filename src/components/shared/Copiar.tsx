"use client";

import { Copy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

/** Un dato con botón para copiarlo (CBU, alias, titular, neto). */
export function Copiar({ etiqueta, valor }: { etiqueta: string; valor: string | null }) {
  if (!valor) return <span className="text-muted-foreground">sin {etiqueta.toLowerCase()}</span>;
  return (
    <span className="inline-flex items-center gap-1">
      <span className="font-mono text-xs">{valor}</span>
      <Button size="sm" variant="ghost" className="h-6 px-1.5" aria-label={`Copiar ${etiqueta}`}
        onClick={() => navigator.clipboard.writeText(valor).then(() => toast.success(`${etiqueta} copiado`))}>
        <Copy className="h-3.5 w-3.5" />
      </Button>
    </span>
  );
}
