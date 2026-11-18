import { notFound } from "next/navigation";
import { CheckCircle, Clock, FileText } from "lucide-react";
import Decimal from "decimal.js";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { listasDeCarga, obtenerFactura } from "@/lib/facturas/queries";
import { FichaForm } from "./FichaForm";

export const dynamic = "force-dynamic";

const num = (d: Decimal.Value | null | { toString(): string }) => (d == null ? 0 : new Decimal(d.toString()).toNumber());

/** Ficha de una factura: datos a la izquierda, lo que falta y el botón aprobar a la derecha. */
export default async function FichaFacturaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const [datos, listas] = await Promise.all([obtenerFactura(BigInt(id)), listasDeCarga()]);
  if (!datos) notFound();
  const { c, proveedor, remitos, pagos, requisitos } = datos;

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <TituloDePestana label={`${c.tipo} ${c.numero}`} />

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h1 className="text-2xl font-bold text-primary">
          {proveedor?.razon_social ?? c.proveedor_codigo} · {c.tipo} {c.numero}
        </h1>
        <MoneyCell value={num(c.total)} currency="ARS" decimals={2} className="text-xl font-semibold text-primary" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
        <div className="min-w-0 space-y-4">
          <section className="rounded-md border bg-white p-4 text-sm">
            <dl className="grid grid-cols-2 gap-x-6 gap-y-2 md:grid-cols-3">
              <Dato k="Fecha" v={formatDate(c.fecha)} />
              <Dato k="Vence" v={formatDate(c.vencimiento)} />
              <Dato k="Estado" v={<EstadoPill estado={c.estado_aprobacion} />} />
              <Dato k="Neto" v={<MoneyCell value={num(c.neto)} currency="ARS" decimals={2} />} />
              <Dato k="IVA" v={<MoneyCell value={num(c.iva)} currency="ARS" decimals={2} />} />
              <Dato k="Percepciones" v={<MoneyCell value={num(c.percepciones)} currency="ARS" decimals={2} />} />
              <Dato k="Quién recibió" v={c.retiro_por ?? "—"} />
              <Dato k="Descripción" v={c.descripcion ?? "—"} ancho />
              <Dato
                k="PDF"
                v={c.archivo_link ? (
                  <a href={c.archivo_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary underline">
                    <FileText className="h-4 w-4" /> Abrir
                  </a>
                ) : "—"}
              />
            </dl>
          </section>

          <section className="rounded-md border overflow-hidden bg-white text-sm">
            <h2 className="border-b px-4 py-2 font-semibold text-primary">Renglones</h2>
            {c.items.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground">Sin renglones cargados.</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="px-4 text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Descripción</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Cant.</TableHead>
                    <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>P. unit.</TableHead>
                    <TableHead className="px-4 text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Subtotal</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {c.items.map((i) => (
                    <TableRow key={String(i.id)}>
                      <TableCell className="min-w-[240px] whitespace-normal px-4">{i.descripcion}{i.para_que ? <span className="text-muted-foreground"> · {i.para_que}</span> : null}</TableCell>
                      <TableCell>{i.cantidad?.toString() ?? ""} {i.unidad_medida ?? ""}</TableCell>
                      <TableCell className="text-right">{i.precio_unitario != null ? <MoneyCell value={num(i.precio_unitario)} currency="ARS" decimals={2} /> : ""}</TableCell>
                      <TableCell className="px-4 text-right">{i.subtotal != null ? <MoneyCell value={num(i.subtotal)} currency="ARS" decimals={2} /> : ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </section>

          <section className="rounded-md border overflow-hidden bg-white text-sm">
            <h2 className="border-b px-4 py-2 font-semibold text-primary">Remitos</h2>
            {remitos.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground">Ninguno ligado.</p>
            ) : (
              <ul className="divide-y">
                {remitos.map((r) => (
                  <li key={String(r.id)} className="flex justify-between px-4 py-2">
                    <span>{r.numero ?? "S/N"} · {formatDate(r.fecha)} · {r.retiro_por ?? "—"}{r.autorizo ? ` · autorizó ${r.autorizo}` : ""}</span>
                    {r.archivo_link?.startsWith("http") && <a href={r.archivo_link} target="_blank" rel="noreferrer" className="text-primary underline">Ver</a>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="rounded-md border overflow-hidden bg-white text-sm">
            <h2 className="border-b px-4 py-2 font-semibold text-primary">Órdenes de pago</h2>
            {pagos.length === 0 ? (
              <p className="px-4 py-3 text-muted-foreground">No está en ninguna OP.</p>
            ) : (
              <ul className="divide-y">
                {pagos.map((p) => (
                  <li key={p.numero} className="flex justify-between px-4 py-2">
                    <span>{p.numero} · {p.estado} · {formatDate(p.fecha)}</span>
                    <MoneyCell value={Number(p.importe)} currency="ARS" decimals={2} />
                  </li>
                ))}
              </ul>
            )}
          </section>
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
  if (!estado) return <>—</>;
  if (estado === "Aprobado") return <StatusPill tone="success" icon={CheckCircle}>{estado}</StatusPill>;
  if (estado === "Pendiente") return <StatusPill tone="amber" icon={Clock}>{estado}</StatusPill>;
  return <StatusPill tone="neutral">{estado}</StatusPill>;
}

function Dato({ k, v, ancho }: { k: string; v: React.ReactNode; ancho?: boolean }) {
  return (
    <div className={ancho ? "col-span-full min-w-0 break-words" : "min-w-0 break-words"}>
      <dt className="text-xs font-medium text-muted-foreground">{k}</dt>
      <dd>{v}</dd>
    </div>
  );
}
