"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, Loader2, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { FichaBarButton } from "@/components/properties/FichaCard";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { decidirLinea } from "./actions";

interface Props {
  numero: string;
  total: string;
  /** Las líneas que faltan decidir. */
  lineas: { id: string; factura: string; importe: string }[];
}

/**
 * Aprobar de una vez las líneas que faltan, con una confirmación que dice cuáles. Es la
 * misma acción que aprobar de a una (una decisión por línea, queda la historia); se
 * frena en la primera que la base rechace.
 */
export function AprobarTodas({ numero, total, lineas }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);

  function aprobar() {
    startTransition(async () => {
      let hechas = 0;
      for (const l of lineas) {
        const r = await decidirLinea(numero, l.id, "Aprobada", "");
        if (!r.ok) { toast.error(`${l.factura}: ${r.mensaje}`); break; }
        hechas += 1;
      }
      if (hechas > 0) toast.success(`${hechas} ${hechas === 1 ? "factura aprobada" : "facturas aprobadas"} en la ${numero}`);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <>
      <FichaBarButton onClick={() => setAbierto(true)}>
        <CheckCheck className="h-3.5 w-3.5" /> Aprobar las {lineas.length}
      </FichaBarButton>
      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>Aprobar {lineas.length} facturas de la {numero}</AlertDialogTitle>
            <AlertDialogDescription>Quedan aprobadas las que faltaban decidir. Si después hay que frenar una, se observa igual.</AlertDialogDescription>
          </AlertDialogHeader>
          <ul className="divide-y rounded-md border text-sm">
            {lineas.map((l) => (
              <li key={l.id} className="flex items-center justify-between px-3 py-2">
                <span>{l.factura}</span>
                <MoneyCell value={Number(l.importe)} currency="ARS" decimals={2} />
              </li>
            ))}
          </ul>
          <p className="text-xs text-muted-foreground">
            Total de la OP: <MoneyCell value={Number(total)} currency="ARS" decimals={2} />
          </p>
          <AlertDialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" onClick={aprobar} disabled={pendiente}>
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Aprobar {lineas.length}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
