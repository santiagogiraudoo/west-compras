import Link from "next/link";
import { CheckCircle, Paperclip, ShoppingCart, TriangleAlert } from "lucide-react";
import Decimal from "decimal.js";
import { FichaCard, FichaDato } from "@/components/properties/FichaCard";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { tresPuntas } from "@/lib/entrada/cruce";
import type { Compra, RemitoDeCompra } from "@/lib/compras/queries";
import { formatDate } from "@/lib/utils";

const $ = (v: string | null, className?: string) =>
  v == null ? "—" : <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;

/** Cómo se dice el estado de una compra. */
export const ESTADO_COMPRA: Record<string, { tono: "success" | "amber" | "indigo" | "neutral"; texto: string }> = {
  "pedido confirmado": { tono: "indigo", texto: "Pedida" },
  "esperando remito": { tono: "amber", texto: "Esperando remito" },
  hecho: { tono: "success", texto: "Entregada" },
  descartado: { tono: "neutral", texto: "Descartada" },
};

/**
 * La compra de una factura y la cadena entera: lo comprado, lo facturado, sus remitos y a qué
 * factura fue cada uno, y si cruzan las tres puntas (lo que permite aprobar una sola vez).
 */
export function TarjetaCompra({ datos, facturaId }: { datos: { compra: Compra; remitos: RemitoDeCompra[] } | null; facturaId: string }) {
  if (!datos) {
    return (
      <FichaCard icon={ShoppingCart} title="Compra">
        <p className="flex items-center gap-1.5 px-5 py-4 text-[13px] text-[#92400e]">
          <TriangleAlert className="h-3.5 w-3.5" /> Sin compra: ningún remito de esta factura llega a una compra. No sale aprobada sola por tope.
        </p>
      </FichaCard>
    );
  }
  const { compra: k, remitos } = datos;
  const cruce = tresPuntas(k.importe, k.facturado, k.firmados, k.sin_firmar);
  const e = ESTADO_COMPRA[k.estado] ?? { tono: "neutral" as const, texto: k.estado };
  return (
    <FichaCard icon={ShoppingCart} title="Compra"
      actions={<StatusPill tone={e.tono} size="sm">{e.texto}</StatusPill>}>
      <div className="border-b border-[#eeede8] px-5 py-3 text-[13px]">
        <Link href="/compras" className="font-medium text-primary hover:underline">{k.nombre}</Link>
        <span className="text-[#8a8a85]"> · {formatDate(k.fecha)}{k.unidad ? ` · ${k.unidad}` : ""}{k.autorizo ? ` · autorizó ${k.autorizo}` : ""}</span>
      </div>
      <div className="grid grid-cols-3 border-b border-[#eeede8]">
        <FichaDato label="Comprado" value={$(k.importe)} numerico />
        <FichaDato label="Facturado" value={$(k.facturado)} numerico />
        <FichaDato label="Saldo" value={$(k.saldo)} numerico />
      </div>
      <div className={`flex items-start gap-1.5 border-b border-[#eeede8] px-5 py-2.5 text-[13px] ${cruce.cruza ? "text-[#1B4332]" : "text-[#92400e]"}`}>
        {cruce.cruza ? <CheckCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> : <TriangleAlert className="mt-0.5 h-3.5 w-3.5 shrink-0" />}
        {cruce.cruza ? "Cruzan compra, remito y factura: se aprueba una sola vez." : `No cruza: ${cruce.motivos.join(" · ")}.`}
      </div>
      <ul className="divide-y divide-[#f2f1ec]">
        {remitos.map((r) => (
          <li key={r.id} className="flex flex-wrap items-center justify-between gap-2 px-5 py-2.5 text-[13px]">
            <span className="min-w-0">
              <span className="font-medium">Remito {r.numero ?? "S/N"}</span>
              <span className="text-[#8a8a85]"> · {formatDate(r.fecha)}{r.retiro_por ? ` · retiró ${r.retiro_por}` : ""}</span>
              {r.archivo_link && (
                <a href={r.archivo_link} target="_blank" rel="noreferrer" className="ml-2 inline-flex items-center gap-1 text-primary hover:underline">
                  <Paperclip className="h-3 w-3" /> ver
                </a>
              )}
            </span>
            <span className="flex items-center gap-2">
              {r.estado === "ok" ? <StatusPill tone="success" size="sm">Firmado</StatusPill> : <StatusPill tone="amber" size="sm">Sin firmar</StatusPill>}
              {r.factura_id === facturaId ? <span className="text-[12px] text-[#8a8a85]">esta factura</span>
                : r.factura_id ? <Link href={`/bandeja/${r.factura_id}`} className="text-[12px] text-primary hover:underline">{r.factura}</Link>
                : <span className="text-[12px] text-[#92400e]">sin factura</span>}
              {r.importe != null && $(r.importe)}
            </span>
          </li>
        ))}
      </ul>
    </FichaCard>
  );
}
