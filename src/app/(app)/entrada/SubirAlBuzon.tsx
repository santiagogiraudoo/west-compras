"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, RefreshCw, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { reprocesar, subirAlBuzon } from "./actions";

/** Subir un documento al buzón: lo procesa el mismo lector que WhatsApp y el mail. */
export function SubirAlBuzon() {
  const router = useRouter();
  const archivo = useRef<HTMLInputElement>(null);
  const [mensaje, setMensaje] = useState("");
  const [pending, start] = useTransition();

  function subir() {
    const f = archivo.current?.files?.[0];
    if (!f) { toast.error("Elegí la foto o el PDF."); return; }
    start(async () => {
      const fd = new FormData();
      fd.set("archivo", f);
      fd.set("mensaje", mensaje);
      const r = await subirAlBuzon(fd);
      (r.ok ? toast.success : toast.error)(r.mensaje);
      if (archivo.current) archivo.current.value = "";
      setMensaje("");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border bg-[#FFFEFC] p-3">
      <Input ref={archivo} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="max-w-xs" />
      <Input placeholder="Nota (opcional): para qué obra, quién retiró…" value={mensaje} onChange={(e) => setMensaje(e.target.value)} className="min-w-[240px] flex-1" />
      <Button size="sm" onClick={subir} disabled={pending}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir y procesar
      </Button>
    </div>
  );
}

export function Reprocesar({ id }: { id: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <Button size="sm" variant="ghost" className="mt-1 h-7 px-2" disabled={pending}
      onClick={() => start(async () => { const r = await reprocesar(id); (r.ok ? toast.success : toast.error)(r.mensaje); router.refresh(); })}>
      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Procesar de nuevo
    </Button>
  );
}
