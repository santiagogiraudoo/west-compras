import Link from "next/link";
import { ChevronRight, ExternalLink, Paperclip } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import type { DetalleFactura as Detalle } from "@/lib/cuenta/queries";

const $ = (v: string | null) => (v == null ? "—" : <MoneyCell value={Number(v)} currency="ARS" decimals={0} />);
const ROT = "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]";

/** El detalle de una factura dentro de la cuenta del proveedor: importes, ítems, remitos y pagos. */
export function DetalleFactura({ d, id }: { d: Detalle | undefined; id: string }) {
  if (!d) return <p className="text-sm text-muted-foreground">Sin detalle.</p>;
  return (
    <div className="grid gap-5 text-[12.5px] lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
      <div className="min-w-0 space-y-3">
        <div className="flex flex-wrap gap-x-6 gap-y-1">
          <span><span className={ROT}>Neto</span> {$(d.neto)}</span>
          <span><span className={ROT}>IVA</span> {$(d.iva)}</span>
          {Number(d.percepciones) !== 0 && <span><span className={ROT}>Percepciones</span> {$(d.percepciones)}</span>}
        </div>
        {d.items.length > 0 ? (
          <div className="overflow-hidden rounded-md border bg-white">
            <div className="grid grid-cols-[minmax(0,1fr)_70px_100px_100px] gap-x-3 border-b bg-[#fafaf7] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
              <span>Ítem</span><span className="text-right">Cant.</span><span className="text-right">Precio</span><span className="text-right">Subtotal</span>
            </div>
            {d.items.map((it, i) => (
              <div key={i} className="grid grid-cols-[minmax(0,1fr)_70px_100px_100px] gap-x-3 border-b px-3 py-1.5 last:border-b-0">
                <span className="min-w-0 truncate" title={it.descripcion}>{it.descripcion}</span>
                <span className="text-right text-[#525252]">{it.cantidad ? Number(it.cantidad).toLocaleString("es-AR") : "—"}</span>
                <span className="text-right">{$(it.precio)}</span>
                <span className="text-right">{$(it.subtotal)}</span>
              </div>
            ))}
          </div>
        ) : <p className="text-muted-foreground">Sin ítems cargados.</p>}
        {d.descripcion && <p className="line-clamp-3 text-[12px] text-[#737373]" title={d.descripcion}>{d.descripcion}</p>}
      </div>
      <div className="min-w-0 space-y-3">
        <div>
          <p className={ROT}>Remitos</p>
          {d.remitos.length === 0 ? <p className="text-[#92400e]">Sin remito firmado</p> : (
            <ul className="mt-1 space-y-0.5">
              {d.remitos.map((r, i) => (
                <li key={i} className="flex items-center gap-2">
                  <span className="font-medium">{r.numero ?? "S/N"}</span>
                  <span className="text-muted-foreground">{formatDate(r.fecha)}{r.retiro_por ? ` · ${r.retiro_por}` : ""}</span>
                  {r.archivo_link && <a href={r.archivo_link} target="_blank" rel="noreferrer" className="ml-auto text-primary hover:underline"><ExternalLink className="h-3.5 w-3.5" /></a>}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div>
          <p className={ROT}>Órdenes de pago</p>
          {d.ops.length === 0 ? <p className="text-muted-foreground">En ninguna OP todavía</p> : (
            <ul className="mt-1 space-y-1">
              {d.ops.map((o) => (
                <li key={o.numero} className="flex items-center gap-2">
                  {o.de_app ? <Link href={`/op/${o.numero}`} className="font-medium text-primary hover:underline">{o.numero}</Link> : <span className="font-medium">{o.numero}</span>}
                  <StatusPill tone={o.estado === "Pagada" ? "success" : "amber"}>{o.estado === "Pagada" ? `Pagada ${formatDate(o.fecha)}` : "Prevista"}</StatusPill>
                  <span className="ml-auto">{$(o.importe)}</span>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="flex flex-wrap gap-x-4 gap-y-1 border-t border-[#eeede8] pt-2">
          {d.archivo_link
            ? <a href={d.archivo_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Paperclip className="h-3.5 w-3.5" /> PDF de la factura</a>
            : <span className="text-[#92400e]">Sin PDF</span>}
          <Link href={`/bandeja/${id}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Ficha completa <ChevronRight className="h-3.5 w-3.5" /></Link>
        </div>
      </div>
    </div>
  );
}
