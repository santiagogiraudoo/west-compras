"use client";

import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription,
  AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { anularOP } from "./actions";

/** Anular una OP Prevista armada en la app, con confirmación. */
export function AnularOP({ numero }: { numero: string }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();

  function anular() {
    startTransition(async () => {
      const r = await anularOP(numero);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      router.refresh();
    });
  }

  return (
    <AlertDialog>
      <AlertDialogTrigger asChild>
        <Button size="sm" variant="outline" disabled={pendiente}
          className="h-8 border-[#f3c9c9] text-[#b91c1c] hover:bg-[#fdf5f5] hover:text-[#b91c1c]">
          <Ban className="h-4 w-4" /> Anular
        </Button>
      </AlertDialogTrigger>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>¿Anular la {numero}?</AlertDialogTitle>
          <AlertDialogDescription>
            Queda Anulada y sus facturas vuelven a estar libres para otra OP. El número no se reutiliza.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>Volver</AlertDialogCancel>
          <AlertDialogAction onClick={anular}>Anular OP</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
