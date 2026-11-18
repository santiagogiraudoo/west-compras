import Link from "next/link";
import Decimal from "decimal.js";
import { Building2, ChevronLeft, ChevronRight, Receipt, Tags, TrendingDown, TrendingUp, TriangleAlert, X, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { DescargarCSV } from "@/components/shared/DescargarCSV";
import { formatDate } from "@/lib/utils";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { gastosDelMes, gastosPorMes } from "@/lib/gastos/queries";
import { matrizGastos, mesVecino, serieGastos, totalesPorDestino, variacion } from "@/lib/gastos/calculos";
import { ranking, ultimosMeses } from "@/lib/dashboard/calculos";

export const dynamic = "force-dynamic";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const CORTO = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const $ = (v: Decimal.Value, className?: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";
/** Un color fijo por categoría (las de la lista única); el resto, gris. */
const PALETA = ["#1B4332", "#B8960C", "#2d6a4f", "#f59e0b", "#6b8f71", "#d6b85a", "#94a3b8", "#a3a3a3"];

/**
 * Gastos (fase 5 adelantada): cada factura pagada de West Desarrolladora como gasto de su
 * unidad y, si la unidad es una propiedad o grupo de la app de alquileres, de esa
 * propiedad (Nevado Golf mitad y mitad). Sale de app.v_gastos: no se carga nada a mano.
 * Arriba cómo viene el mes y la evolución; tocar una categoría o una propiedad filtra.
 */
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string; cat?: string; donde?: string }> }) {
  const { mes: q, cat, donde } = await searchParams;
  const hoy = hoyArgentina();
  const mes = q && /^\d{4}-\d{2}$/.test(q) && q <= hoy.slice(0, 7) ? q : hoy.slice(0, 7);
  const meses = ultimosMeses(`${mes}-01`, 6);
  const [gastos, porMes] = await Promise.all([gastosDelMes(mes), gastosPorMes(`${meses[0]}-01`)]);
  const serie = serieGastos(meses, porMes);
  const [a, m] = mes.split("-");
  const esteMes = serie[serie.length - 1];
  const anterior = serie[serie.length - 2];
  const delta = variacion(esteMes.total, anterior.total);
  const sinCat = gastos.filter((g) => !g.categoria);
  const totales = totalesPorDestino(gastos);
  const porCategoria = ranking(gastos.map((g) => ({ clave: g.categoria ?? "Sin categoría", total: g.importe })), 7);
  const matriz = matrizGastos(gastos);
  // Un color por categoría para todo el período, así cada una se ve igual en todos los meses.
  const categorias = ranking(serie.flatMap((s) => s.porCategoria.map((c) => ({ clave: c.categoria, total: c.total }))), 99)
    .map((c) => c.clave).filter((c) => c !== "Sin categoría");
  const colorDe = (c: string) => (c === "Sin categoría" ? "#dc2626" : categorias.includes(c) ? PALETA[categorias.indexOf(c) % PALETA.length] : "#a3a3a3");
  const detalle = gastos.filter((g) => (!cat || (g.categoria ?? "Sin categoría") === cat) && (!donde || (g.destino ?? g.unidad) === donde));
  const link = (p: { mes?: string; cat?: string | null; donde?: string | null }) => {
    const sp = new URLSearchParams();
    sp.set("mes", p.mes ?? mes);
    const c = p.cat === undefined ? cat : p.cat;
    const d = p.donde === undefined ? donde : p.donde;
    if (c) sp.set("cat", c);
    if (d) sp.set("donde", d);
    return `/gastos?${sp}`;
  };
  const futuro = mesVecino(mes, 1) > hoy.slice(0, 7);
  const maxMes = Math.max(1, ...serie.map((s) => Number(s.total)));

  const tarjetas: { label: string; v: React.ReactNode; sub: React.ReactNode; icon: LucideIcon; tono: string }[] = [
    { label: "Gastado en el mes", v: $(esteMes.total), sub: `${gastos.length} renglones pagados`, icon: Receipt, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: `Contra ${MESES[Number(anterior.mes.slice(5, 7)) - 1].toLowerCase()}`, v: delta == null ? "—" : `${delta > 0 ? "+" : ""}${delta} %`,
      sub: <>el mes anterior fue {$(anterior.total)}</>, icon: delta != null && delta < 0 ? TrendingDown : TrendingUp,
      tono: delta != null && delta > 20 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600" },
    { label: "Dónde se gastó más", v: totales[0]?.donde ?? "—", sub: totales[0] ? <>{$(totales[0].total)} · {totales.length} lugares con gasto</> : "sin gastos",
      icon: Building2, tono: "bg-[#1B4332]/10 text-[#1B4332]" },
    { label: "Sin categoría", v: sinCat.length ? $(sinCat.reduce((t, g) => t.plus(g.importe), new Decimal(0))) : "Nada",
      sub: sinCat.length ? `${sinCat.length} renglones: cargales la categoría` : "todo categorizado", icon: sinCat.length ? TriangleAlert : Tags,
      tono: sinCat.length ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Gastos</h1>
          <p className="text-sm text-muted-foreground">
            Cada factura pagada, en su unidad y en su propiedad o grupo de la app de alquileres. Fecha: salida de caja.
          </p>
        </div>
        <div className="inline-flex h-[34px] items-center rounded-[8px] border bg-white px-1">
          <Link href={link({ mes: mesVecino(mes, -1) })} aria-label="Mes anterior" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#404040] hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[120px] text-center text-[13px] font-medium text-[#404040]">{MESES[Number(m) - 1]} {a}</span>
          {futuro ? <span className="flex h-7 w-7 items-center justify-center text-[#c4c3bd]"><ChevronRight className="h-4 w-4" /></span> : (
            <Link href={link({ mes: mesVecino(mes, 1) })} aria-label="Mes siguiente" className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#404040] hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
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

      {/* Evolución: seis meses, apilado por categoría; tocar un mes lo abre */}
      <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
        <h2 className="mb-3 text-sm font-semibold text-primary">Cómo viene el gasto <span className="font-normal text-muted-foreground">· últimos 6 meses, por categoría</span></h2>
        <div className="grid h-44 items-end gap-3" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
          {serie.map((s) => (
            <Link key={s.mes} href={link({ mes: s.mes })} className="group flex h-full flex-col justify-end"
              title={`${CORTO[Number(s.mes.slice(5, 7)) - 1]}: $${Number(s.total).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}>
              <span className="mb-1 text-center text-[10px] tabular-nums text-muted-foreground">
                {Number(s.total) ? `${(Number(s.total) / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M` : ""}
              </span>
              <div className={`mx-auto flex w-[60%] max-w-14 flex-col-reverse overflow-hidden rounded-t-[3px] ${s.mes === mes ? "ring-2 ring-[#B8960C] ring-offset-1" : "opacity-80 group-hover:opacity-100"}`}
                style={{ height: `${(Number(s.total) / maxMes) * 100}%` }}>
                {s.porCategoria.map((c) => <div key={c.categoria} style={{ flex: Number(c.total), background: colorDe(c.categoria) }} />)}
              </div>
            </Link>
          ))}
        </div>
        <div className="mt-2 grid gap-3 border-t border-[#eeede8] pt-2" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
          {serie.map((s) => <span key={s.mes} className={`text-center text-[11px] ${s.mes === mes ? "font-semibold text-primary" : "text-muted-foreground"}`}>{CORTO[Number(s.mes.slice(5, 7)) - 1]} {s.mes.slice(2, 4)}</span>)}
        </div>
      </section>

      {gastos.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay pagos en {MESES[Number(m) - 1].toLowerCase()} {a}.</p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <Panel titulo="En qué se gastó" nota="tocá una para filtrar el detalle">
              {porCategoria.map((c) => (
                <Barra key={c.clave} href={link({ cat: cat === c.clave ? null : c.clave })} activo={cat === c.clave}
                  label={c.clave} valor={c.total} max={Number(porCategoria[0].total)} color={colorDe(c.clave)} total={esteMes.total} />
              ))}
            </Panel>
            <Panel titulo="Dónde se gastó" nota="propiedad, grupo o unidad sola">
              {totales.slice(0, 8).map((t) => (
                <Barra key={t.donde} href={link({ donde: donde === t.donde ? null : t.donde })} activo={donde === t.donde}
                  label={t.donde} sub={t.esUnidad ? "unidad sola" : undefined} valor={t.total} max={Number(totales[0].total)} color="#1B4332" total={esteMes.total} />
              ))}
              {totales.length > 8 && <p className="pt-1 text-xs text-muted-foreground">y {totales.length - 8} más en el cruce de abajo</p>}
            </Panel>
          </div>

          {/* Cruce dónde × categoría: el color dice cuánto */}
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-primary">Cruce por propiedad y categoría</h2>
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full text-[12.5px]" style={{ minWidth: 260 + matriz.columnas.length * 120 }}>
                <thead className="border-b bg-[#fafaf7]">
                  <tr>
                    <th className={TH}>Dónde</th>
                    {matriz.columnas.map((c) => <th key={c} className={`${TH} text-right`}>{c}</th>)}
                    <th className={`${TH} text-right`}>Total</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#f2f1ec]">
                  {matriz.filas.map((f) => (
                    <tr key={f}>
                      <td className="px-3 py-2 font-medium"><Link href={link({ donde: f })} className="underline-offset-2 hover:text-primary hover:underline">{f}</Link></td>
                      {matriz.columnas.map((c) => {
                        const v = matriz.celda[f]?.[c];
                        const alfa = v ? 0.06 + 0.3 * (Number(v) / matriz.max) : 0;
                        return (
                          <td key={c} className="px-3 py-2 text-right tabular-nums" style={{ background: v ? `rgba(184, 150, 12, ${alfa})` : undefined }}>
                            {v ? <Link href={link({ donde: f, cat: c })} className="hover:underline">{$(v)}</Link> : <span className="text-[#d4d4d0]">·</span>}
                          </td>
                        );
                      })}
                      <td className="px-3 py-2 text-right font-semibold">{$(totales.find((t) => t.donde === f)?.total ?? 0)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>

          <section className="space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="flex flex-wrap items-center gap-2 text-base font-semibold text-primary">
                Detalle <span className="text-xs font-normal text-muted-foreground">{detalle.length} renglones · {$(detalle.reduce((t, g) => t.plus(g.importe), new Decimal(0)))}</span>
                {(cat || donde) && (
                  <Link href={link({ cat: null, donde: null })} className="inline-flex items-center gap-1 rounded-full bg-[#1B4332] px-2.5 py-0.5 text-[11.5px] font-medium text-white">
                    {[cat, donde].filter(Boolean).join(" · ")} <X className="h-3 w-3" />
                  </Link>
                )}
              </h2>
              <DescargarCSV nombre={`gastos-${mes}`} montos={["importe"]}
                columnas={[{ k: "fecha", label: "Fecha" }, { k: "op_numero", label: "OP" }, { k: "proveedor", label: "Proveedor" }, { k: "factura", label: "Factura" },
                  { k: "categoria", label: "Categoría" }, { k: "donde", label: "Propiedad o grupo" }, { k: "unidad_codigo", label: "Unidad" }, { k: "titular", label: "Titular" }, { k: "importe", label: "Importe" }]}
                filas={detalle.map((g) => ({ fecha: g.fecha, op_numero: g.op_numero, proveedor: g.proveedor, factura: `${g.tipo} ${g.factura}`, categoria: g.categoria,
                  donde: g.destino ?? g.unidad, unidad_codigo: g.unidad_codigo, titular: g.titular, importe: g.importe }))} />
            </div>
            <div className="overflow-x-auto rounded-md border bg-white">
              <table className="w-full min-w-[860px] text-[13px]">
                <thead className="border-b bg-[#fafaf7]">
                  <tr><th className={TH}>Fecha</th><th className={TH}>OP</th><th className={TH}>Proveedor</th><th className={TH}>Factura</th><th className={TH}>Categoría</th><th className={TH}>Dónde</th><th className={`${TH} text-right`}>Importe</th></tr>
                </thead>
                <tbody className="divide-y divide-[#f2f1ec]">
                  {detalle.map((g, i) => (
                    <tr key={i} className="hover:bg-[#fafaf7]">
                      <td className="px-3 py-2.5 whitespace-nowrap">{formatDate(g.fecha)}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><Link href={`/op/${g.op_numero}`} className="font-medium text-primary underline-offset-2 hover:underline">{g.op_numero}</Link></td>
                      <td className="px-3 py-2.5">{g.proveedor}</td>
                      <td className="px-3 py-2.5 whitespace-nowrap"><Link href={`/bandeja/${g.comprobante_id}`} className="underline-offset-2 hover:text-primary hover:underline">{g.tipo} {g.factura}</Link></td>
                      <td className="px-3 py-2.5">
                        <span className="inline-flex items-center gap-1.5">
                          <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: colorDe(g.categoria ?? "Sin categoría") }} />
                          {g.categoria ?? <Link href={`/bandeja/${g.comprobante_id}`} className="font-medium text-[#92400e] hover:underline">Sin categoría: cargala</Link>}
                        </span>
                      </td>
                      <td className="px-3 py-2.5">{g.destino ?? g.unidad}<span className="block text-xs text-muted-foreground">{g.unidad_codigo}</span></td>
                      <td className="px-3 py-2.5 text-right font-medium">{$(g.importe)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}

function Panel({ titulo, nota, children }: { titulo: string; nota: string; children: React.ReactNode }) {
  return (
    <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
      <h2 className="mb-3 text-sm font-semibold text-primary">{titulo} <span className="font-normal text-muted-foreground">· {nota}</span></h2>
      <div className="space-y-2.5">{children}</div>
    </section>
  );
}

function Barra({ href, activo, label, sub, valor, max, color, total }: {
  href: string; activo: boolean; label: string; sub?: string; valor: string; max: number; color: string; total: string;
}) {
  const pct = Number(total) ? Math.round((Number(valor) / Number(total)) * 100) : 0;
  return (
    <Link href={href} scroll={false} className={`block rounded-md px-2 py-1 -mx-2 transition ${activo ? "bg-[#f0f6f2]" : "hover:bg-[#f5f5f0]"}`}>
      <div className="flex items-baseline gap-2 text-xs">
        <span className="min-w-0 truncate font-medium text-primary">{label}</span>
        {sub && <span className="shrink-0 text-muted-foreground">{sub}</span>}
        <span className="ml-auto shrink-0 text-muted-foreground">{pct} %</span>
        {$(valor, "shrink-0 font-medium text-primary")}
      </div>
      <div className="mt-1 h-1.5 rounded-full bg-[#f0efe9]">
        <div className="h-1.5 rounded-full" style={{ width: `${Math.max(1.5, (Number(valor) / max) * 100)}%`, background: color }} />
      </div>
    </Link>
  );
}
