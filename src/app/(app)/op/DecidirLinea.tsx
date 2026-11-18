"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Check, MessageSquareWarning } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import type { Decision } from "@/lib/op/pago";
import { decidirLinea } from "./actions";

interface Props {
  numero: string;
  comprobanteId: string;
  factura: string;
  decision: Decision | null;
}

/** Aprobar u observar una línea de la OP. Observar pide el motivo y frena toda la OP. */
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

  return (
    <div className="flex justify-end gap-1">
      {decision !== "Aprobada" && (
        <Button size="sm" variant="outline" disabled={pendiente} onClick={() => decidir("Aprobada")}>
          <Check className="h-4 w-4" /> Aprobar
        </Button>
      )}
      {decision !== "Observada" && (
        <Dialog open={abierto} onOpenChange={setAbierto}>
          <DialogTrigger asChild>
            <Button size="sm" variant="ghost" disabled={pendiente}>
              <MessageSquareWarning className="h-4 w-4" /> Observar
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Observar {factura}</DialogTitle>
              <DialogDescription>Una línea observada frena toda la {numero} hasta que se apruebe o se anule la OP.</DialogDescription>
            </DialogHeader>
            <Textarea value={motivo} onChange={(e) => setMotivo(e.target.value)} rows={3}
              placeholder="Qué hay que revisar (ej.: el remito no coincide con la factura)" />
            <DialogFooter>
              <Button size="sm" disabled={pendiente || motivo.trim().length < 5} onClick={() => decidir("Observada")}>
                <MessageSquareWarning className="h-4 w-4" /> Observar línea
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
