"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import Decimal from "decimal.js";
import { CheckCircle, Loader2, Send, SlidersHorizontal, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { aReservar, type OPSugerida } from "@/lib/cuenta/plan";
import { armarPlan } from "@/app/(app)/op/actions";
import { formatDate } from "@/lib/utils";

const $ = (v: string, className?: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;
const COLS = "grid grid-cols-[28px_minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1.2fr)_96px_110px_120px_84px] items-center gap-x-3";

/**
 * El plan de pagos: todas las OP que hay que armar ya, una por proveedor y titular, con las NC
 * descontadas. Se tildan y un botón las arma y las manda a aprobar. Vienen tildadas las que tienen
 * algo vencido y el alta del proveedor completa.
 */
export function PlanDePagos({ ops, faltan, hoy }: { ops: OPSugerida[]; faltan: Record<string, string[]>; hoy: string }) {
  const router = useRouter();
  const puede = (o: OPSugerida) => !(faltan[o.proveedor]?.length);
  const [sel, setSel] = useState<Set<string>>(() => new Set(ops.filter((o) => puede(o) && new Decimal(o.vencido).gt(0)).map((o) => o.clave)));
  const [pending, start] = useTransition();
  const elegidas = ops.filter((o) => sel.has(o.clave));
  const total = useMemo(() => elegidas.reduce((t, o) => t.plus(o.total), new Decimal(0)).toFixed(2), [elegidas]);
  const cambiar = (clave: string, si: boolean) => setSel((s) => { const n = new Set(s); if (si) n.add(clave); else n.delete(clave); return n; });

  function armar() {
    start(async () => {
      const r = await armarPlan(elegidas.map(aReservar), true);
      if (!r.ok) { toast.error(r.mensaje); return; }
      (r.resultados.every((x) => x.ok) ? toast.success : toast.warning)(r.mensaje);
      for (const x of r.resultados.filter((y) => !y.ok)) toast.error(`${ops.find((o) => o.proveedor === x.proveedor)?.razon_social ?? x.proveedor}: ${x.mensaje}`);
      router.push("/op");
    });
  }

  if (ops.length === 0) {
    return <div className="rounded-lg border bg-white p-10 text-center text-sm text-muted-foreground">No vence nada en los próximos 7 días. Todo al día.</div>;
  }
  const todas = ops.filter(puede);
  return (
    <div className="space-y-3">
      <div className="overflow-hidden rounded-lg border bg-white">
        <div className={`${COLS} border-b bg-[#FFFEFC] px-4 py-2 text-[11px] font-medium text-muted-foreground`}>
          <Checkbox checked={todas.length > 0 && todas.every((o) => sel.has(o.clave))} aria-label="Elegir todas"
            onCheckedChange={(v) => setSel(v === true ? new Set(todas.map((o) => o.clave)) : new Set())} />
          <span>Proveedor</span><span>Paga</span><span>Qué va</span><span>Vence</span>
          <span className="text-right">Vencido</span><span className="text-right">Total OP</span><span />
        </div>
        {ops.map((o) => {
          const falta = faltan[o.proveedor] ?? [];
          const fac = o.items.filter((i) => !i.importe.startsWith("-")).length;
          const nc = o.items.length - fac;
          return (
            <div key={o.clave} className={`${COLS} border-b px-4 py-2.5 text-sm last:border-b-0 ${falta.length ? "opacity-60" : ""}`}>
              <Checkbox checked={sel.has(o.clave)} disabled={falta.length > 0 || pending} aria-label={`Elegir ${o.razon_social}`}
                onCheckedChange={(v) => cambiar(o.clave, v === true)} />
              <div className="min-w-0">
                <span className="block truncate font-medium">{o.razon_social}</span>
                {falta.length > 0
                  ? <Link href={`/proveedores/${o.proveedor}`} className="flex items-center gap-1 text-xs text-[#991b1b] hover:underline"><TriangleAlert className="h-3 w-3" /> Falta {falta.join(", ")}</Link>
                  : o.despues > 0 && <span className="text-xs text-muted-foreground">{o.despues} más que vencen después</span>}
              </div>
              <span className="truncate text-xs">{o.titular}</span>
              <span className="text-xs">
                {fac} factura{fac > 1 ? "s" : ""}{nc ? ` · ${nc} NC descontada${nc > 1 ? "s" : ""}` : ""}
                {new Decimal(o.total).isZero() && <span className="block text-[#1B4332]">Compensación: la NC cancela todo</span>}
              </span>
              <span className={`text-xs ${o.vence && o.vence < hoy ? "font-medium text-[#991b1b]" : ""}`}>{formatDate(o.vence)}</span>
              <span className="text-right">{new Decimal(o.vencido).gt(0) ? $(o.vencido, "text-[#991b1b]") : "—"}</span>
              <span className="text-right">{$(o.total, "font-semibold")}</span>
              <Link href={`/op/nueva?proveedor=${o.proveedor}`} className="inline-flex items-center justify-end gap-1 text-xs text-primary hover:underline">
                <SlidersHorizontal className="h-3 w-3" /> Ajustar
              </Link>
            </div>
          );
        })}
      </div>
      <div className="sticky bottom-0 flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-[#FFFEFC] px-4 py-3">
        <span className="text-sm">
          {elegidas.length ? <>{elegidas.length} OP por {$(total, "font-semibold text-primary")}</> : "Tildá las OP a armar"}
        </span>
        <Button size="sm" onClick={armar} disabled={pending || elegidas.length === 0}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          Armar {elegidas.length || ""} y mandar a aprobar
        </Button>
      </div>
      <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
        <CheckCircle className="h-3.5 w-3.5" /> Cada OP se vuelve a validar al armarla (lo libre, el titular, el doble pago con ClickUp). Las que cruzan compra, remito y factura dentro del tope salen aprobadas solas.
      </p>
    </div>
  );
}
