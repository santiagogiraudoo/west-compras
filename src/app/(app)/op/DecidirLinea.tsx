"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { Decision } from "@/lib/op/pago";
import { decidirLinea } from "./actions";

interface Props {
  numero: string;
  comprobanteId: string;
  factura: string;
  decision: Decision | null;
}

/**
 * Aprobar u observar una línea de la OP. Sin decidir: Aprobar (un clic) y Observar.
 * Ya decidida: solo el cambio a la otra, discreto. Observar pide el motivo, como anular
 * un gasto en alquileres, porque frena toda la OP.
 */
export function DecidirLinea({ numero, comprobanteId, factura, decision }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  function decidir(d: Decision) {
    startTransition(async () => {
      const r = await decidirLinea(numero, comprobanteId, d, d === "Observada" ? motivo : "");
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  }

  const sinDecidir = decision === null;

  return (
    <div className="flex items-center justify-end gap-1.5">
      {decision !== "Aprobada" && (
        <Button size="sm" variant={sinDecidir ? "default" : "outline"} disabled={pendiente}
          className={sinDecidir ? "h-8" : "h-7 text-xs"} onClick={() => decidir("Aprobada")}>
          {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Check className="h-4 w-4" />} Aprobar
        </Button>
      )}
      {decision !== "Observada" && (
        <Button size="sm" variant={sinDecidir ? "outline" : "ghost"} disabled={pendiente}
          className={sinDecidir
            ? "h-8 border-[#f3c9c9] text-[#b91c1c] hover:bg-[#fdf5f5] hover:text-[#b91c1c]"
            : "h-7 text-xs text-muted-foreground hover:text-[#b91c1c]"}
          onClick={() => setAbierto(true)}>
          <Ban className="h-4 w-4" /> Observar
        </Button>
      )}

      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Observar {factura}</AlertDialogTitle>
            <AlertDialogDescription>
              Frena toda la {numero}: no pasa a Pagos hasta que esta factura se apruebe o se anule la OP.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <div className="space-y-1.5">
            <label htmlFor={`motivo-${comprobanteId}`} className="text-sm font-medium">Qué hay que revisar</label>
            <Textarea id={`motivo-${comprobanteId}`} value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
              placeholder="Ej.: el remito no coincide con la factura" autoFocus />
          </div>
          <AlertDialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" disabled={pendiente || motivo.trim().length < 5}
              className="bg-[#b91c1c] text-white hover:bg-[#991b1b]"
              onClick={() => decidir("Observada")}>
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Ban className="h-4 w-4" />} Observar factura
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
