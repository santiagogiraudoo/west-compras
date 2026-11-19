"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCheck, CheckCircle, Loader2, TriangleAlert, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { aprobarEnVerde, pagarConComprobantes } from "@/app/(app)/op/actions";

/**
 * Aprobar de un toque todo lo propio que está en verde (cruzan compra, remito y factura, con PDF
 * y sin suba de precio, en OP sin frenos). Lo demás se mira en cada tarjeta.
 */
export function AprobarEnVerde({ renglones, ops, total }: { renglones: number; ops: number; total: string }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  if (renglones === 0) return null;
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-l-[3px] border-l-[#1B4332] bg-[#f0f6f2] px-4 py-3">
      <p className="flex items-center gap-2 text-sm text-[#0f2a1f]">
        <CheckCircle className="h-4 w-4" />
        {renglones} renglón{renglones === 1 ? "" : "es"} tuyo{renglones === 1 ? "" : "s"} en {ops} OP están en verde por{" "}
        <MoneyCell value={Number(total)} currency="ARS" decimals={0} className="font-semibold" />: cruzan compra, remito y factura.
      </p>
      <Button size="sm" disabled={pending}
        onClick={() => start(async () => { const r = await aprobarEnVerde(); (r.ok ? toast.success : toast.error)(r.mensaje); router.refresh(); })}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCheck className="h-4 w-4" />} Aprobar todo lo que está en verde
      </Button>
    </div>
  );
}

/**
 * Pagar con los comprobantes: se sueltan uno o varios y cada uno encuentra su OP autorizada. Si
 * coincide exacto (monto y cuenta del proveedor), el pago queda registrado solo; si no, dice a
 * qué OP parece y se registra a mano en su tarjeta.
 */
export function PagarConComprobantes() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [resultados, setResultados] = useState<{ archivo: string; mensaje: string; pagada: boolean }[]>([]);

  function subir(files: FileList | null) {
    if (!files?.length) return;
    start(async () => {
      const fd = new FormData();
      for (const f of Array.from(files)) fd.append("archivos", f);
      const r = await pagarConComprobantes(fd);
      (r.ok ? toast.success : toast.message)(r.mensaje);
      setResultados(r.resultados);
      if (input.current) input.current.value = "";
      router.refresh();
    });
  }

  return (
    <div className="space-y-2 rounded-lg border bg-[#FFFEFC] p-4">
      <label className="flex cursor-pointer flex-wrap items-center gap-3"
        onDragOver={(e) => e.preventDefault()} onDrop={(e) => { e.preventDefault(); subir(e.dataTransfer.files); }}>
        <span className="inline-flex h-9 items-center gap-2 rounded-md bg-primary px-3 text-sm font-medium text-white">
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />} Subir comprobantes
        </span>
        <span className="text-sm text-muted-foreground">
          Soltá acá las transferencias o echeqs (PDF o foto, varios a la vez). Cada uno encuentra su OP y, si coincide exacto, queda pagada.
        </span>
        <input ref={input} type="file" multiple accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
          disabled={pending} onChange={(e) => subir(e.target.files)} />
      </label>
      {resultados.length > 0 && (
        <ul className="space-y-1 text-sm">
          {resultados.map((r) => (
            <li key={r.archivo} className={`flex items-start gap-1.5 ${r.pagada ? "text-[#1B4332]" : "text-[#92400e]"}`}>
              {r.pagada ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
              <span><span className="font-medium">{r.archivo}</span>: {r.mensaje}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
