import Link from "next/link";
import { ChevronRight, ExternalLink } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import { vencimientoOP } from "@/lib/op/pago";
import type { OPCerrada, OPConLineas } from "@/lib/op/queries";
import { AccionOP } from "@/components/op/AccionOP";

const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";

/** Una sección del paso: título, contador, ayuda y el total a la derecha. */
export function Seccion({ titulo, n, ayuda, total, children }: {
  titulo: string; n: number; ayuda: string; total?: string; children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
          {titulo}
          <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{n}</span>
        </h2>
        <span className="text-xs text-muted-foreground">{ayuda}</span>
        {total != null && <MoneyCell value={Number(total)} currency="ARS" decimals={0} className="ml-auto text-sm font-semibold text-primary" />}
      </div>
      {children}
    </section>
  );
}

export function Vacio({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-lg border border-border/60 bg-white p-10 text-center">
      <p className="text-sm text-muted-foreground">{children}</p>
    </div>
  );
}

/** OP en armado: una fila por OP, con "Mandar a aprobar" a mano. */
export function TablaEnArmado({ ops, hoy, puede }: { ops: OPConLineas[]; hoy: string; puede: boolean }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="border-b bg-[#fafaf7]">
          <tr><th className={TH}>OP</th><th className={TH}>Proveedor</th><th className={TH}>Facturas</th><th className={TH}>Vence</th><th className={`${TH} text-right`}>Total</th><th /></tr>
        </thead>
        <tbody className="divide-y divide-[#f2f1ec]">
          {ops.map((o) => {
            const vence = vencimientoOP(o.lineas);
            return (
              <tr key={o.numero} className="hover:bg-[#fafaf7]">
                <td className="px-3 py-2.5"><Link href={`/op/${o.numero}`} className="font-semibold text-primary underline-offset-2 hover:underline">{o.numero}</Link></td>
                <td className="px-3 py-2.5">{o.razon_social}</td>
                <td className="px-3 py-2.5 text-muted-foreground">{o.lineas.length} · {[...new Set(o.lineas.map((l) => l.unidad_nombre || l.unidad))].join(", ")}</td>
                <td className={`px-3 py-2.5 ${vence && vence < hoy ? "font-medium text-[#b91c1c]" : ""}`}>{vence ? formatDate(vence) : "—"}</td>
                <td className="px-3 py-2.5 text-right font-semibold"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={0} /></td>
                <td className="px-3 py-2 text-right">{puede ? <AccionOP numero={o.numero} accion="enviar" /> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** Pagadas y descartadas de los últimos días: cuándo, cuánto y el comprobante. */
export function TablaCerradas({ ops }: { ops: OPCerrada[] }) {
  return (
    <div className="overflow-x-auto rounded-md border bg-white">
      <table className="w-full min-w-[720px] text-[13px]">
        <thead className="border-b bg-[#fafaf7]">
          <tr><th className={TH}>OP</th><th className={TH}>Proveedor</th><th className={TH}>Estado</th><th className={TH}>Fecha</th><th className={`${TH} text-right`}>Total</th><th className={TH}>Comprobante</th><th className="w-6" /></tr>
        </thead>
        <tbody className="divide-y divide-[#f2f1ec]">
          {ops.map((o) => (
            <tr key={o.numero} className="group hover:bg-[#fafaf7]">
              <td className="px-3 py-2.5"><Link href={`/op/${o.numero}`} className="font-semibold text-primary underline-offset-2 hover:underline">{o.numero}</Link></td>
              <td className="px-3 py-2.5">{o.razon_social}</td>
              <td className="px-3 py-2.5">
                {o.estado === "Pagada" ? <StatusPill tone="success">Pagada</StatusPill>
                  : <span title={o.motivo_descarte ?? ""}><StatusPill tone="neutral">Descartada</StatusPill></span>}
              </td>
              <td className="px-3 py-2.5">{formatDate(o.fecha)}</td>
              <td className={`px-3 py-2.5 text-right ${o.estado === "Descartada" ? "text-muted-foreground line-through" : "font-semibold"}`}>
                <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={0} />
              </td>
              <td className="px-3 py-2.5">
                {o.comprobante_link
                  ? <a href={o.comprobante_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Ver <ExternalLink className="h-3 w-3" /></a>
                  : <span className="text-muted-foreground">{o.estado === "Pagada" ? "sin subir" : o.motivo_descarte ?? "—"}</span>}
              </td>
              <td className="px-2 text-muted-foreground/50 group-hover:text-primary"><ChevronRight className="h-4 w-4" /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
