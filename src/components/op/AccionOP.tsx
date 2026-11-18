"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, CheckCheck, Loader2, MessageSquareWarning, RotateCcw, Send, Trash2, X, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  AlertDialog, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { decidirOP, descartarOP, enviarAAprobar, quitarObservacionOP } from "@/app/(app)/op/actions";

type Accion = "aprobar" | "observar" | "bloquear" | "enviar" | "descartar" | "resolver" | "quitar";

// Los mismos tonos que los botones de las fichas de alquileres: verde para lo que
// avanza, borde rojo para lo que frena, discreto para lo que se usa poco.
const VERDE = "h-8";
const FRENA = "h-8 border-[#f3c9c9] text-[#b91c1c] hover:bg-[#fdf5f5] hover:text-[#b91c1c]";
const DISCRETO = "h-8 text-muted-foreground hover:text-[#b91c1c]";

const ACCIONES: Record<Accion, {
  label: string; icon: LucideIcon; variant: "default" | "outline" | "ghost"; clase: string;
  /** Si pide comentario, abre un diálogo. `rojo` para lo que frena o descarta. */
  pide?: { titulo: string; ayuda: string; placeholder: string; rojo?: boolean };
}> = {
  aprobar: { label: "Aprobar", icon: Check, variant: "default", clase: VERDE },
  enviar: { label: "Mandar a aprobar", icon: Send, variant: "default", clase: VERDE },
  resolver: {
    label: "Resolver observación", icon: CheckCheck, variant: "default", clase: VERDE,
    pide: { titulo: "Resolver la observación de", ayuda: "Aprueba los renglones que otro observó o bloqueó. Queda tu comentario.", placeholder: "Cómo se resolvió (ej.: el proveedor mandó el remito)" },
  },
  quitar: {
    label: "Quitar observación", icon: RotateCcw, variant: "outline", clase: "h-8",
    pide: { titulo: "Quitar la observación de", ayuda: "Los renglones observados o bloqueados vuelven a esperar decisión. No quedan aprobados.", placeholder: "Por qué se quita (ej.: era un error, ya se aclaró)" },
  },
  observar: {
    label: "Observar", icon: MessageSquareWarning, variant: "outline", clase: FRENA,
    pide: { titulo: "Observar", ayuda: "Frena toda la OP hasta que se resuelva o se quite la observación. El comentario le llega a Adriano.", placeholder: "Qué hay que revisar (ej.: el remito no coincide con la factura)", rojo: true },
  },
  bloquear: {
    label: "Bloquear", icon: Ban, variant: "ghost", clase: DISCRETO,
    pide: { titulo: "Bloquear", ayuda: "Para lo que no se tiene que pagar así. Frena toda la OP.", placeholder: "Por qué se bloquea", rojo: true },
  },
  descartar: {
    label: "Descartar", icon: Trash2, variant: "ghost", clase: DISCRETO,
    pide: { titulo: "Descartar", ayuda: "Queda descartada y sus facturas vuelven a estar libres. El número no se reutiliza.", placeholder: "Motivo del descarte", rojo: true },
  },
};

/** Un botón de acción sobre una OP de la app. Las que frenan, descartan o resuelven piden comentario. */
export function AccionOP({ numero, accion }: { numero: string; accion: Accion }) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [texto, setTexto] = useState("");
  const a = ACCIONES[accion];
  const Icon = a.icon;

  function hacer() {
    startTransition(async () => {
      const r =
        accion === "enviar" ? await enviarAAprobar(numero)
        : accion === "descartar" ? await descartarOP(numero, texto)
        : accion === "resolver" ? await decidirOP(numero, "Aprobada", texto, true)
        : accion === "quitar" ? await quitarObservacionOP(numero, texto)
        : await decidirOP(numero, accion === "aprobar" ? "Aprobada" : accion === "observar" ? "Observada" : "Bloqueada", texto);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      setAbierto(false);
      setTexto("");
      router.refresh();
    });
  }

  const boton = (
    <Button size="sm" variant={a.variant} className={a.clase} disabled={pendiente} onClick={a.pide ? () => setAbierto(true) : hacer}>
      {pendiente && !a.pide ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {a.label}
    </Button>
  );
  if (!a.pide) return boton;

  return (
    <>
      {boton}
      <AlertDialog open={abierto} onOpenChange={setAbierto}>
        <AlertDialogContent className="sm:max-w-md">
          <AlertDialogHeader>
            <AlertDialogTitle>{a.pide.titulo} la {numero}</AlertDialogTitle>
            <AlertDialogDescription>{a.pide.ayuda}</AlertDialogDescription>
          </AlertDialogHeader>
          <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder={a.pide.placeholder} autoFocus />
          <AlertDialogFooter>
            <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
              <X className="h-4 w-4" /> Cancelar
            </Button>
            <Button size="sm" disabled={pendiente || texto.trim().length < 5} onClick={hacer}
              className={a.pide.rojo ? "bg-[#b91c1c] text-white hover:bg-[#991b1b]" : undefined}>
              {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />} {a.label}
            </Button>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
