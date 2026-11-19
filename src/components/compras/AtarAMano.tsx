"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Link2, Loader2, Plus } from "lucide-react";
import { FichaCard } from "@/components/properties/FichaCard";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { atarRemitoACompra, atarRemitoAFactura, crearCompraDesdeRemito, type Resultado } from "@/app/(app)/compras/actions";
import type { ParaAtar } from "@/lib/compras/queries";
import { formatDate } from "@/lib/utils";

const $ = (v: string | null) => (v == null ? null : <MoneyCell value={Number(v)} currency="ARS" decimals={0} />);

/**
 * Atar a mano lo que no cruzó solo: remitos sueltos del proveedor a esta factura, y los remitos
 * de esta factura a una compra (o crearla desde el remito). La base frena lo que no puede ser.
 */
export function AtarAMano({ facturaId, datos }: { facturaId: string; datos: ParaAtar }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [compraDe, setCompraDe] = useState<Record<string, string>>({});
  const correr = (f: () => Promise<Resultado>) => start(async () => {
    const r = await f();
    (r.ok ? toast.success : toast.error)(r.mensaje);
    router.refresh();
  });
  if (!datos.sueltos.length && !datos.sinCompra.length) return null;

  return (
    <FichaCard icon={Link2} title="Atar a mano">
      <div className="space-y-4 px-5 py-4 text-[13px]">
        {datos.sinCompra.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Remitos de esta factura sin compra: elegí la compra o creala desde el remito.</p>
            {datos.sinCompra.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[160px] font-medium">Remito {r.numero ?? "S/N"} <span className="font-normal text-muted-foreground">· {formatDate(r.fecha)}</span></span>
                {$(r.importe)}
                {datos.compras.length > 0 && (
                  <>
                    <Select value={compraDe[r.id] ?? ""} onValueChange={(v) => setCompraDe((x) => ({ ...x, [r.id]: v }))}>
                      <SelectTrigger className="h-8 w-[260px]"><SelectValue placeholder="Elegí la compra" /></SelectTrigger>
                      <SelectContent>
                        {datos.compras.map((k) => (
                          <SelectItem key={k.id} value={k.id}>{k.nombre} · {formatDate(k.fecha)}{k.importe ? ` · $${Number(k.importe).toLocaleString("es-AR")}` : ""}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button size="sm" variant="outline" className="h-8" disabled={pending || !compraDe[r.id]}
                      onClick={() => correr(() => atarRemitoACompra(r.id, compraDe[r.id], facturaId))}>
                      {pending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />} Atar
                    </Button>
                  </>
                )}
                <Button size="sm" variant="ghost" className="h-8" disabled={pending}
                  onClick={() => correr(() => crearCompraDesdeRemito(r.id, facturaId))}>
                  <Plus className="h-3.5 w-3.5" /> Crear compra
                </Button>
              </div>
            ))}
          </div>
        )}
        {datos.sueltos.length > 0 && (
          <div className="space-y-2">
            <p className="text-[12px] text-muted-foreground">Remitos del proveedor sin factura: si alguno es de esta, atalo.</p>
            {datos.sueltos.map((r) => (
              <div key={r.id} className="flex flex-wrap items-center gap-2">
                <span className="min-w-[160px] font-medium">Remito {r.numero ?? "S/N"} <span className="font-normal text-muted-foreground">· {formatDate(r.fecha)}{r.retiro_por ? ` · retiró ${r.retiro_por}` : ""}</span></span>
                {$(r.importe)}
                {r.estado !== "ok" && <span className="text-[12px] text-[#92400e]">sin firmar</span>}
                <Button size="sm" variant="outline" className="h-8" disabled={pending}
                  onClick={() => correr(() => atarRemitoAFactura(r.id, facturaId))}>
                  <Link2 className="h-3.5 w-3.5" /> Es de esta factura
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </FichaCard>
  );
}
