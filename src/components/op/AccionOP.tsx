"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Ban, Check, CheckCheck, MessageSquareWarning, RotateCcw, Send, Trash2, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { decidirOP, descartarOP, enviarAAprobar, quitarObservacionOP } from "@/app/(app)/op/actions";

type Accion = "aprobar" | "observar" | "bloquear" | "enviar" | "descartar" | "resolver" | "quitar";

const ACCIONES: Record<Accion, {
  label: string; icon: LucideIcon; variant: "default" | "outline" | "ghost";
  /** Si pide comentario, abre un diálogo. */
  pide?: { titulo: string; ayuda: string; placeholder: string };
}> = {
  aprobar: { label: "Aprobar", icon: Check, variant: "default" },
  enviar: { label: "Mandar a aprobar", icon: Send, variant: "default" },
  resolver: {
    label: "Resolver observación", icon: CheckCheck, variant: "default",
    pide: { titulo: "Resolver la observación de", ayuda: "Aprueba los renglones que otro observó o bloqueó. Queda tu comentario.", placeholder: "Cómo se resolvió (ej.: el proveedor mandó el remito)" },
  },
  observar: {
    label: "Observar", icon: MessageSquareWarning, variant: "outline",
    pide: { titulo: "Observar", ayuda: "Frena toda la OP hasta que se resuelva. El comentario le llega a Adriano.", placeholder: "Qué hay que revisar (ej.: el remito no coincide con la factura)" },
  },
  bloquear: {
    label: "Bloquear", icon: Ban, variant: "ghost",
    pide: { titulo: "Bloquear", ayuda: "Para lo que no se tiene que pagar así. Frena toda la OP.", placeholder: "Por qué se bloquea" },
  },
  descartar: {
    label: "Descartar", icon: Trash2, variant: "ghost",
    pide: { titulo: "Descartar", ayuda: "Queda descartada y sus facturas vuelven a estar libres. El número no se reutiliza.", placeholder: "Motivo del descarte" },
  },
  quitar: {
    label: "Quitar observación", icon: RotateCcw, variant: "outline",
    pide: { titulo: "Quitar la observación de", ayuda: "Los renglones observados o bloqueados vuelven a esperar decisión. No quedan aprobados.", placeholder: "Por qué se quita (ej.: era un error, ya se aclaró)" },
  },
};

/** Un botón de acción sobre una OP de la app. Observar, bloquear y descartar piden comentario. */
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

  if (!a.pide) {
    return (
      <Button size="sm" variant={a.variant} disabled={pendiente} onClick={hacer}>
        <Icon className="h-4 w-4" /> {a.label}
      </Button>
    );
  }
  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm" variant={a.variant} disabled={pendiente}><Icon className="h-4 w-4" /> {a.label}</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{a.pide.titulo} la {numero}</DialogTitle>
          <DialogDescription>{a.pide.ayuda}</DialogDescription>
        </DialogHeader>
        <Textarea value={texto} onChange={(e) => setTexto(e.target.value)} rows={3} placeholder={a.pide.placeholder} />
        <DialogFooter>
          <Button size="sm" disabled={pendiente || texto.trim().length < 5} onClick={hacer}>
            <Icon className="h-4 w-4" /> {a.label}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
