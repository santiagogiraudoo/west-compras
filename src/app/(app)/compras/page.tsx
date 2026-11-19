import Link from "next/link";
import Decimal from "decimal.js";
import { CheckCircle, MailOpen, TriangleAlert } from "lucide-react";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { ESTADO_COMPRA } from "@/components/compras/TarjetaCompra";
import { listarCompras, type Compra } from "@/lib/compras/queries";
import { tresPuntas } from "@/lib/entrada/cruce";
import { hayLibre } from "@/lib/montos";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const $ = (v: string | null) => (v == null ? "—" : <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} />);
const COLS = "grid grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)_120px_110px_110px_110px_minmax(0,1.3fr)] items-center gap-x-3";

/** En qué está la cadena de la compra, en pocas palabras. */
function cadena(k: Compra): { ok: boolean; texto: string } {
  if (k.firmados + k.sin_firmar === 0) return { ok: false, texto: "Falta el remito" };
  if (new Decimal(k.facturado).isZero()) return { ok: false, texto: "Falta la factura" };
  const t = tresPuntas(k.importe, k.facturado, k.firmados, k.sin_firmar);
  return t.cruza ? { ok: true, texto: "Cruzan compra, remito y factura" } : { ok: false, texto: t.motivos.join(" · ") };
}

/**
 * Compras: la tercera punta del cruce compra ↔ remito ↔ factura. Entran con su confirmación o
 * con el remito (por el Buzón o desde ClickUp) y se cierran cuando la factura cruza con ambos.
 */
export default async function ComprasPage() {
  const compras = await listarCompras();
  const abiertas = compras.filter((k) => k.estado === "pedido confirmado" || k.estado === "esperando remito").length;
  const conSaldo = compras.filter((k) => k.saldo != null && hayLibre(k.saldo)).length;
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-8 py-6">
      <TituloDePestana label="Compras" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Compras</h1>
          <p className="text-sm text-muted-foreground">
            {compras.length} compras · {abiertas} esperando entrega · {conSaldo} con algo sin facturar. La orden sigue en ClickUp: acá entra con la confirmación o con el remito.
          </p>
        </div>
        <Link href="/entrada" className="inline-flex h-8 items-center gap-1.5 rounded-md border bg-white px-3 text-sm font-medium text-primary hover:bg-[#f0f6f2]">
          <MailOpen className="h-4 w-4" /> Subir una confirmación o un remito
        </Link>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <div className={`${COLS} border-b bg-[#FFFEFC] px-4 py-2 text-[11px] font-medium text-muted-foreground`}>
          <span>Compra</span><span>Proveedor · unidad</span><span>Estado</span>
          <span className="text-right">Comprado</span><span className="text-right">Facturado</span><span className="text-right">Saldo</span><span>Cadena</span>
        </div>
        {compras.length === 0 && <p className="p-6 text-sm text-muted-foreground">Todavía no hay compras. Entran con su confirmación o con el remito, por el Buzón.</p>}
        {compras.map((k) => {
          const e = ESTADO_COMPRA[k.estado] ?? { tono: "neutral" as const, texto: k.estado };
          const c = cadena(k);
          return (
            <div key={k.id} className={`${COLS} border-b px-4 py-2.5 text-sm last:border-b-0`}>
              <div className="min-w-0">
                <span className="block truncate font-medium" title={k.nombre}>{k.nombre}</span>
                <span className="text-xs text-muted-foreground">{formatDate(k.fecha)}{k.autorizo ? ` · autorizó ${k.autorizo}` : ""}</span>
              </div>
              <div className="min-w-0 text-xs">
                <span className="block truncate font-medium">{k.proveedor ?? "Sin proveedor"}</span>
                <span className="block truncate text-muted-foreground">{k.unidad ?? "Sin unidad"}</span>
              </div>
              <StatusPill tone={e.tono} size="sm">{e.texto}</StatusPill>
              <span className="text-right">{$(k.importe)}</span>
              <span className="text-right">{$(k.facturado)}</span>
              <span className="text-right">{$(k.saldo)}</span>
              <span className={`flex min-w-0 items-start gap-1.5 text-xs ${c.ok ? "text-[#1B4332]" : "text-[#92400e]"}`}>
                {c.ok ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
                <span>{c.texto}{k.falta ? <span className="block text-muted-foreground">Le falta: {k.falta}</span> : null}</span>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}
