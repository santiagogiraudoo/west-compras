"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, MinusCircle, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { sacarDeOP } from "@/app/(app)/op/actions";

/** Sacar una factura de la OP (queda libre para otra), con motivo. La OP sigue con las demás. */
export function SacarDeOP({ numero, comprobanteId, factura }: { numero: string; comprobanteId: string; factura: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [motivo, setMotivo] = useState("");

  function sacar() {
    startTransition(async () => {
      const r = await sacarDeOP(numero, comprobanteId, motivo);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      setAbierto(false);
      setMotivo("");
      router.refresh();
    });
  }

  return (
    <>
      <button type="button" onClick={() => setAbierto(true)}
        className="inline-flex items-center gap-1 text-[11.5px] font-medium text-[#8a8a85] hover:text-[#b91c1c]">
        <MinusCircle className="h-3.5 w-3.5" /> Sacar de la OP
      </button>
      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Sacar la {factura} de la {numero}</AlertDialogTitle>
            <AlertDialogDescription>
              La OP sigue con las demás facturas y su total baja. Esta factura queda libre para armar otra OP.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3} autoFocus
            placeholder="Por qué se saca (ej.: se paga aparte, falta el remito)" />
          <AlertDialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" disabled={pendiente || motivo.trim().length < 5} onClick={sacar}
              className="bg-[#b91c1c] text-white hover:bg-[#991b1b]">
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <MinusCircle className="h-4 w-4" />} Sacar de la OP
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
