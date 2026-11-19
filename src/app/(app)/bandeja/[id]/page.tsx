import Link from "next/link";
import { notFound } from "next/navigation";
import { Banknote, CheckCircle, Clock, ExternalLink, FileText, Paperclip, Receipt, StickyNote, Truck } from "lucide-react";
import Decimal from "decimal.js";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { NotaFactura } from "@/components/shared/NotaFactura";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import {
  FichaCard, FichaDato, FichaTabla, FichaTablaCabecera, FichaTablaFila,
} from "@/components/properties/FichaCard";
import { limpiarItem } from "@/components/op/formato";
import { formatDate } from "@/lib/utils";
import { listasDeCarga, obtenerFactura } from "@/lib/facturas/queries";
import { FichaForm } from "./FichaForm";

export const dynamic = "force-dynamic";

const num = (d: Decimal.Value | null | { toString(): string }) => (d == null ? 0 : new Decimal(d.toString()).toNumber());
const $ = (d: Decimal.Value | null | { toString(): string }, className?: string) =>
  <MoneyCell value={num(d)} currency="ARS" decimals={0} className={className} />;
const COLS_RENGLONES = "minmax(0,1fr) 100px 120px 130px";

/**
 * Ficha de una factura, como la ficha de Gasto de alquileres: encabezado con número y
 * estado, los datos en tarjetas (importes, renglones, remitos, OP, nota) y, a la derecha,
 * lo que falta y el botón aprobar.
 */
export default async function FichaFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [datos, listas] = await Promise.all([obtenerFactura(BigInt(id)), listasDeCarga()]);
  if (!datos) notFound();
  const { c, proveedor, remitos, pagos, requisitos } = datos;
  const unidad = listas.unidades.find((u) => u.value === c.unidad_codigo)?.label ?? c.unidad_codigo;

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-8 pt-5 pb-8">
      <TituloDePestana label={`${c.tipo} ${c.numero}`} />

      {/* Encabezado: número y estado, de quién y cuánto */}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.015em] text-primary">{c.tipo} {c.numero}</h1>
            <EstadoPill estado={c.estado_aprobacion} />
            {c.archivo_link && (
              <a href={c.archivo_link} target="_blank" rel="noreferrer"
                className="inline-flex h-[30px] items-center gap-1.5 rounded-[8px] border border-border bg-white px-3 text-[13px] font-medium text-primary hover:bg-[#f0f6f2]">
                <Paperclip className="h-3.5 w-3.5" /> Ver PDF <ExternalLink className="h-3 w-3 opacity-60" />
              </a>
            )}
          </div>
          <p className="mt-1 text-[13.5px] text-[#525252]">
            <Link href={`/cuenta/${c.proveedor_codigo}`} className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline">
              {proveedor?.razon_social ?? c.proveedor_codigo}
            </Link>
            {" · "}{formatDate(c.fecha)} → vence {formatDate(c.vencimiento)}
            {c.facturado_a ? <> · a nombre de {c.facturado_a}</> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">Total</p>
          {$(c.total, "block text-[26px] leading-8 font-semibold text-primary")}
        </div>
      </div>

      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="min-w-0 space-y-4">
          <FichaCard icon={Receipt} title="Factura">
            <div className="grid grid-cols-2 border-b border-[#eeede8] sm:grid-cols-4">
              <FichaDato label="Neto" value={$(c.neto)} numerico />
              <FichaDato label="IVA" value={$(c.iva)} numerico />
              <FichaDato label="Percepciones" value={$(c.percepciones)} numerico />
              <FichaDato label="Total" value={$(c.total, "font-semibold")} numerico />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-4">
              <FichaDato label="Unidad" value={unidad} />
              <FichaDato label="Categoría" value={c.categoria} />
              <FichaDato label="Rubro" value={proveedor?.rubro ?? null} />
              <FichaDato label="Quién recibió" value={c.retiro_por} />
            </div>
          </FichaCard>

          <FichaCard icon={FileText} title="Renglones"
            actions={<span className="text-xs text-white/75">{c.items.length}</span>}>
            {c.items.length === 0 ? (
              <p className="px-5 py-4 text-[13px] text-[#8a8a85]">Sin renglones cargados.</p>
            ) : (
              <div className="p-4">
                <FichaTabla>
                  <FichaTablaCabecera cols={COLS_RENGLONES}>
                    <span>Descripción</span><span className="text-right">Cantidad</span><span className="text-right">P. unit.</span><span className="text-right">Subtotal</span>
                  </FichaTablaCabecera>
                  {c.items.map((i) => (
                    <FichaTablaFila key={String(i.id)} cols={COLS_RENGLONES}>
                      <span className="min-w-0 pr-3">
                        {limpiarItem(i.descripcion)}
                        {i.para_que && <span className="block text-[11.5px] text-[#8a8a85]">Para qué: {i.para_que}</span>}
                      </span>
                      <span className="text-right text-[#525252]">
                        {i.cantidad != null ? `${Number(i.cantidad).toLocaleString("es-AR")} ${i.unidad_medida ?? ""}` : "—"}
                      </span>
                      <span className="text-right">{i.precio_unitario != null ? $(i.precio_unitario) : "—"}</span>
                      <span className="text-right">{i.subtotal != null ? $(i.subtotal) : "—"}</span>
                    </FichaTablaFila>
                  ))}
                </FichaTabla>
              </div>
            )}
          </FichaCard>

          <div className="grid gap-4 lg:grid-cols-2">
            <FichaCard icon={Truck} title="Remitos" actions={<span className="text-xs text-white/75">{remitos.length}</span>}>
              {remitos.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-[#8a8a85]">Ninguno ligado.</p>
              ) : (
                <ul className="divide-y divide-[#f2f1ec]">
                  {remitos.map((r) => (
                    <li key={String(r.id)} className="px-5 py-3 text-[13px]">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-medium">{r.numero ?? "S/N"}</span>
                        <span className="text-[#8a8a85]">{formatDate(r.fecha)}</span>
                      </div>
                      <p className="mt-0.5 text-[#525252]">
                        {[r.retiro_por && `Retiró ${r.retiro_por}`, r.autorizo && `autorizó ${r.autorizo}`].filter(Boolean).join(" · ") || "—"}
                      </p>
                      {r.archivo_link?.startsWith("http") ? (
                        <a href={r.archivo_link} target="_blank" rel="noreferrer" className="mt-1 inline-flex items-center gap-1 font-medium text-primary hover:underline">
                          <Paperclip className="h-3 w-3" /> Ver remito
                        </a>
                      ) : r.archivo_link ? <p className="mt-0.5 text-[11.5px] text-[#8a8a85]">{r.archivo_link}</p> : null}
                    </li>
                  ))}
                </ul>
              )}
            </FichaCard>

            <FichaCard icon={Banknote} title="Órdenes de pago" actions={<span className="text-xs text-white/75">{pagos.length}</span>}>
              {pagos.length === 0 ? (
                <p className="px-5 py-4 text-[13px] text-[#8a8a85]">No está en ninguna OP.</p>
              ) : (
                <ul className="divide-y divide-[#f2f1ec]">
                  {pagos.map((p) => (
                    <li key={p.numero} className="flex items-center justify-between gap-3 px-5 py-3 text-[13px]">
                      <span>
                        <Link href={`/op/${p.numero}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.numero}</Link>
                        <span className="text-[#8a8a85]"> · {p.estado} · {formatDate(p.fecha)}</span>
                      </span>
                      {$(p.importe)}
                    </li>
                  ))}
                </ul>
              )}
            </FichaCard>
          </div>

          {c.descripcion && (
            <FichaCard icon={StickyNote} title="Nota de la carga">
              <div className="px-5 py-4">
                <NotaFactura texto={c.descripcion} sinRenglones={c.items[0]?.descripcion} />
              </div>
            </FichaCard>
          )}
        </div>

        <FichaForm
          id={String(c.id)}
          proveedorCodigo={c.proveedor_codigo}
          inicial={{ unidad: c.unidad_codigo ?? "", categoria: c.categoria ?? "", facturadoA: c.facturado_a ?? "" }}
          listas={listas}
          rubroProveedor={proveedor?.rubro ?? null}
          requisitos={requisitos}
          aprobada={c.estado_aprobacion === "Aprobado"}
          sinPdf={!c.archivo_link && c.tipo !== "Sin factura"}
          totalNoCierra={requisitos.faltan.some((f) => f.startsWith("El total"))}
        />
      </div>
    </div>
  );
}

/** Solo cambia cómo se ve el estado que ya viene de la base. */
function EstadoPill({ estado }: { estado: string | null }) {
  if (!estado) return null;
  if (estado === "Aprobado") return <StatusPill tone="success" icon={CheckCircle} size="md">{estado}</StatusPill>;
  if (estado === "Pendiente") return <StatusPill tone="amber" icon={Clock} size="md">Sin aprobar</StatusPill>;
  return <StatusPill tone="neutral" size="md">{estado}</StatusPill>;
}
