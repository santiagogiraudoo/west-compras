import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { AlertTriangle, Building2, CalendarClock, CheckCircle, Clock, FileText, Receipt, Store, Tags, Wallet, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { DescargarCSV } from "@/components/shared/DescargarCSV";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { formatDate } from "@/lib/utils";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { ranking, ultimosMeses } from "@/lib/dashboard/calculos";
import { diasEntre } from "@/lib/op/estados";
import { movimientosUnidad, unidad } from "@/lib/unidades/queries";

export const dynamic = "force-dynamic";

const MESES = 6;
const CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const PALETA = ["#1B4332", "#B8960C", "#2d6a4f", "#f59e0b", "#6b8f71", "#d6b85a", "#94a3b8"];
const $ = (v: Decimal.Value, className?: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";
const suma = (vs: string[]) => vs.reduce((t, v) => t.plus(v), new Decimal(0));

/**
 * Ficha de una unidad (como el detalle de Unidades en Central de pagos): qué mirar ahora,
 * gasto por mes por rubro, quién le vende, en qué se gastó, lo que falta pagar y el
 * extracto con lo acumulado. Lo facturado es por fecha de factura, sin las anuladas.
 */
export default async function UnidadPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const hoy = hoyArgentina();
  const meses = ultimosMeses(hoy, MESES);
  const [u, movs, abiertosTodos] = await Promise.all([unidad(codigo), movimientosUnidad(codigo, `${meses[0]}-01`), listarAbiertos()]);
  if (!u) notFound();
  const abiertos = abiertosTodos.filter((a) => a.unidad_codigo === codigo && Number(a.deuda) > 0.5)
    .sort((a, b) => (a.vencimiento ?? "9999").localeCompare(b.vencimiento ?? "9999"));
  const faltaDe = new Map(abiertos.map((a) => [a.id, a.deuda]));

  const hace90 = new Date(Date.parse(`${hoy}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const de90 = movs.filter((m) => m.fecha >= hace90);
  const deuda = suma(abiertos.map((a) => a.deuda));
  const vencidas = abiertos.filter((a) => a.vencimiento && a.vencimiento < hoy);
  const vencidasSinOP = vencidas.filter((a) => Number(a.libre) > 0.5);
  const pendientes = movs.filter((m) => m.estado === "Pendiente");
  const sinRubro = movs.filter((m) => !m.rubro);
  const rubros = ranking(movs.map((m) => ({ clave: m.rubro ?? "Sin rubro", total: m.total })), 6);
  const proveedores = ranking(movs.map((m) => ({ clave: m.proveedor, total: m.total })), 8);
  const codigoDe = new Map(movs.map((m) => [m.proveedor, m.proveedor_codigo]));
  const colorDe = (r: string) => (r === "Otros" || r === "Sin rubro" ? "#a3a3a3" : PALETA[Math.max(0, rubros.findIndex((x) => x.clave === r)) % PALETA.length]);
  const porMes = meses.map((mes) => {
    const del = movs.filter((m) => m.mes === mes);
    const top = new Set(rubros.map((r) => r.clave));
    const partes = ranking(del.map((m) => ({ clave: top.has(m.rubro ?? "Sin rubro") ? (m.rubro ?? "Sin rubro") : "Otros", total: m.total })), 99);
    return { mes, total: suma(del.map((m) => m.total)), partes };
  });
  const maxMes = Math.max(1, ...porMes.map((m) => m.total.toNumber()));
  // Extracto: de la más vieja a la más nueva, con lo acumulado en la unidad hasta ahí.
  const viejoPrimero = [...movs].reverse();
  const acumulados = viejoPrimero.reduce<Decimal[]>((acc, m) => [...acc, (acc[acc.length - 1] ?? new Decimal(0)).plus(m.total)], []);
  const extracto = viejoPrimero.map((m, i) => ({ ...m, acumulado: acumulados[i].toFixed(2), falta: faltaDe.get(m.id) ?? null })).reverse();

  const tarjetas: { label: string; v: React.ReactNode; sub: string; icon: LucideIcon; tono: string }[] = [
    { label: "Facturado 90 días", v: $(suma(de90.map((m) => m.total))), sub: `${de90.length} comprobantes`, icon: Receipt, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: `Facturado ${MESES} meses`, v: $(suma(movs.map((m) => m.total))), sub: `${new Set(movs.map((m) => m.proveedor_codigo)).size} proveedores`, icon: FileText, tono: "bg-[#1B4332]/10 text-[#1B4332]" },
    { label: "Falta pagar", v: $(deuda), sub: `${abiertos.length} facturas`, icon: Wallet, tono: "bg-amber-50 text-amber-600" },
    { label: "Vencido", v: $(suma(vencidas.map((a) => a.deuda)), vencidas.length ? "text-red-700" : ""), sub: vencidas.length ? `${vencidas.length} facturas` : "nada vencido", icon: AlertTriangle, tono: "bg-red-50 text-red-600" },
  ];
  const mirar: { icon: LucideIcon; tono: string; texto: React.ReactNode; href?: string }[] = [];
  if (vencidasSinOP.length) mirar.push({ icon: AlertTriangle, tono: "text-red-600", texto: <>{vencidasSinOP.length} facturas vencidas sin OP por {$(suma(vencidasSinOP.map((a) => a.libre)))}</>, href: "/op?paso=armar" });
  if (pendientes.length) mirar.push({ icon: Clock, tono: "text-amber-600", texto: <>{pendientes.length} facturas sin aprobar en la bandeja</>, href: "/bandeja" });
  if (sinRubro.length) mirar.push({ icon: Tags, tono: "text-amber-600", texto: <>{sinRubro.length} facturas sin rubro</> });
  const proxima = abiertos.find((a) => a.vencimiento && a.vencimiento >= hoy);
  if (proxima) mirar.push({ icon: CalendarClock, tono: "text-[#1B4332]", texto: <>Lo próximo que vence: {proxima.razon_social}, {$(proxima.deuda)} el {formatDate(proxima.vencimiento)}</> });

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <TituloDePestana label={u.nombre} />
      <div className="flex items-center gap-4">
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-[#1B4332] text-white"><Building2 className="h-6 w-6" /></div>
        <div>
          <h1 className="text-2xl font-semibold tracking-[-0.015em] text-primary">{u.nombre}</h1>
          <p className="text-[13.5px] text-[#525252]">{u.codigo}{u.destino ? ` · en alquileres: ${u.destino}` : " · unidad sola"}</p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tarjetas.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tono}`}><c.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <div className="truncate text-lg font-semibold text-primary">{c.v}</div>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
        <h2 className="mb-2 text-sm font-semibold text-primary">Para mirar ahora</h2>
        {mirar.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle className="h-4 w-4 text-emerald-600" /> Todo en orden en esta unidad.</p> : (
          <ul className="space-y-1.5">
            {mirar.map((m, i) => (
              <li key={i} className="flex items-center gap-2 text-[13px]">
                <m.icon className={`h-4 w-4 shrink-0 ${m.tono}`} />
                {m.href ? <Link href={m.href} className="hover:text-primary hover:underline">{m.texto}</Link> : <span>{m.texto}</span>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 text-sm font-semibold text-primary">Gasto por mes <span className="font-normal text-muted-foreground">· por rubro</span></h2>
          <div className="grid h-40 items-end gap-3" style={{ gridTemplateColumns: `repeat(${porMes.length}, minmax(0, 1fr))` }}>
            {porMes.map((m) => (
              <div key={m.mes} className="flex h-full flex-col justify-end" title={`${CORTO[Number(m.mes.slice(5, 7)) - 1]}: $${m.total.toDecimalPlaces(0).toNumber().toLocaleString("es-AR")}`}>
                <span className="mb-1 text-center text-[10px] tabular-nums text-muted-foreground">{m.total.gt(0) ? `${(m.total.toNumber() / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M` : ""}</span>
                <div className="mx-auto flex w-[60%] max-w-12 flex-col-reverse overflow-hidden rounded-t-[3px]" style={{ height: `${Math.max(0, (m.total.toNumber() / maxMes) * 100)}%` }}>
                  {m.partes.filter((p) => Number(p.total) > 0).map((p) => <div key={p.clave} style={{ flex: Number(p.total), background: colorDe(p.clave) }} />)}
                </div>
              </div>
            ))}
          </div>
          <div className="mt-2 grid gap-3 border-t border-[#eeede8] pt-2" style={{ gridTemplateColumns: `repeat(${porMes.length}, minmax(0, 1fr))` }}>
            {porMes.map((m) => <span key={m.mes} className="text-center text-[11px] text-muted-foreground">{CORTO[Number(m.mes.slice(5, 7)) - 1]}</span>)}
          </div>
          <div className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[11.5px]">
            {rubros.map((r) => <span key={r.clave} className="flex items-center gap-1.5"><span className="h-2 w-2 rounded-full" style={{ background: colorDe(r.clave) }} />{r.clave}</span>)}
          </div>
        </section>

        <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Store className="h-4 w-4" /> Quién le vende <span className="font-normal text-muted-foreground">· {MESES} meses</span></h2>
          <div className="space-y-2.5">
            {proveedores.length === 0 && <p className="text-sm text-muted-foreground">Sin facturas en el período.</p>}
            {proveedores.map((p) => (
              <div key={p.clave}>
                <div className="flex items-baseline gap-2 text-xs">
                  {codigoDe.get(p.clave)
                    ? <Link href={`/cuenta/${codigoDe.get(p.clave)}`} className="min-w-0 truncate font-medium text-primary hover:underline">{p.clave}</Link>
                    : <span className="min-w-0 truncate font-medium text-primary">{p.clave}</span>}
                  {$(p.total, "ml-auto shrink-0 font-medium text-primary")}
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-[#f0efe9]">
                  <div className="h-1.5 rounded-full bg-[#1B4332]" style={{ width: `${Math.min(100, Math.max(1.5, (Number(p.total) / Math.max(...proveedores.map((x) => Number(x.total)))) * 100))}%` }} />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Tags className="h-4 w-4" /> En qué se gastó <span className="font-normal text-muted-foreground">· por rubro</span></h2>
          <div className="space-y-2.5">
            {rubros.map((r) => {
              const tot = suma(movs.map((m) => m.total));
              return (
                <div key={r.clave}>
                  <div className="flex items-baseline gap-2 text-xs">
                    <span className="flex min-w-0 items-center gap-1.5 truncate font-medium text-primary"><span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorDe(r.clave) }} />{r.clave}</span>
                    <span className="ml-auto shrink-0 text-muted-foreground">{tot.isZero() ? 0 : Math.round((Number(r.total) / tot.toNumber()) * 100)} %</span>
                    {$(r.total, "shrink-0 font-medium text-primary")}
                  </div>
                  <div className="mt-1 h-1.5 rounded-full bg-[#f0efe9]">
                    <div className="h-1.5 rounded-full" style={{ width: `${Math.min(100, Math.max(1.5, (Number(r.total) / Math.max(...rubros.map((x) => Number(x.total)))) * 100))}%`, background: colorDe(r.clave) }} />
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <h2 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary"><Wallet className="h-4 w-4" /> Lo que falta pagar <span className="font-normal text-muted-foreground">· la más vencida arriba</span></h2>
          {abiertos.length === 0 ? <p className="flex items-center gap-2 text-sm text-muted-foreground"><CheckCircle className="h-4 w-4 text-emerald-600" /> No se le debe nada a nadie por esta unidad.</p> : (
            <ul className="max-h-72 divide-y divide-[#f2f1ec] overflow-y-auto pr-1">
              {abiertos.map((a) => {
                const dias = a.vencimiento ? diasEntre(hoy, a.vencimiento) : null;
                return (
                  <li key={a.id} className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 py-2 text-[12.5px]">
                    <div className="min-w-0">
                      <Link href={`/cuenta/${a.proveedor_codigo}`} className="block truncate font-medium hover:text-primary hover:underline" title={a.razon_social}>{a.razon_social}</Link>
                      <span className="block truncate text-[11.5px] text-muted-foreground">{a.tipo} {a.numero}{Number(a.en_op) > 0.5 ? ` · en ${a.ops}` : ""}</span>
                    </div>
                    <div className="flex flex-col items-end gap-0.5">
                    {dias == null ? <StatusPill tone="neutral">Sin vencimiento</StatusPill>
                      : dias < 0 ? <StatusPill tone="red" className="whitespace-nowrap">Venció hace {-dias} d</StatusPill>
                      : dias <= 7 ? <StatusPill tone="amber" className="whitespace-nowrap">Vence en {dias} d</StatusPill>
                      : <StatusPill tone="neutral" className="whitespace-nowrap">{formatDate(a.vencimiento)}</StatusPill>}
                    {$(a.deuda, "font-medium")}
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      </div>

      <section className="space-y-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold text-primary">Extracto de gastos <span className="text-xs font-normal text-muted-foreground">· {MESES} meses, lo acumulado en la unidad y lo que falta pagar</span></h2>
          <DescargarCSV nombre={`unidad-${u.codigo}`} montos={["total", "acumulado", "falta"]}
            columnas={[{ k: "fecha", label: "Fecha" }, { k: "proveedor", label: "Proveedor" }, { k: "factura", label: "Comprobante" }, { k: "rubro", label: "Rubro" },
              { k: "total", label: "Importe" }, { k: "acumulado", label: "Acumulado" }, { k: "falta", label: "Falta pagar" }]}
            filas={extracto.map((m) => ({ fecha: m.fecha, proveedor: m.proveedor, factura: `${m.tipo} ${m.numero}`, rubro: m.rubro, total: m.total, acumulado: m.acumulado, falta: m.falta }))} />
        </div>
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full min-w-[820px] text-[13px]">
            <thead className="border-b bg-[#fafaf7]">
              <tr><th className={TH}>Fecha</th><th className={TH}>Proveedor</th><th className={TH}>Comprobante</th><th className={TH}>Rubro</th>
                <th className={`${TH} text-right`}>Importe</th><th className={`${TH} text-right`}>Acumulado</th><th className={`${TH} text-right`}>Falta pagar</th></tr>
            </thead>
            <tbody className="divide-y divide-[#f2f1ec]">
              {extracto.length === 0 && <tr><td colSpan={7} className="p-8 text-center text-sm text-muted-foreground">Sin facturas en los últimos {MESES} meses.</td></tr>}
              {extracto.map((m) => (
                <tr key={m.id} className="hover:bg-[#fafaf7]">
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(m.fecha)}</td>
                  <td className="px-3 py-2"><Link href={`/cuenta/${m.proveedor_codigo}`} className="hover:text-primary hover:underline">{m.proveedor}</Link></td>
                  <td className="px-3 py-2 whitespace-nowrap">
                    <Link href={`/bandeja/${m.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{m.tipo} {m.numero}</Link>
                    {m.estado === "Pendiente" && <span className="ml-1.5 text-[11px] text-[#92400e]">sin aprobar</span>}
                  </td>
                  <td className="px-3 py-2">{m.rubro ?? <span className="text-[#92400e]">sin rubro</span>}</td>
                  <td className={`px-3 py-2 text-right ${Number(m.total) < 0 ? "text-[#1B4332]" : ""}`}>{$(m.total)}</td>
                  <td className="px-3 py-2 text-right text-muted-foreground">{$(m.acumulado)}</td>
                  <td className="px-3 py-2 text-right">{m.falta ? $(m.falta, "font-medium") : <span className="text-muted-foreground">—</span>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </div>
  );
}
