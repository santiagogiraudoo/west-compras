import Link from "next/link";
import { Building2, ChevronLeft, ChevronRight, Receipt, Tags } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { gastosDelMes } from "@/lib/gastos/queries";
import { mesVecino, totalesPorDestino } from "@/lib/gastos/calculos";

export const dynamic = "force-dynamic";

const MESES = ["Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio", "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre"];
const TH = "text-xs font-semibold uppercase tracking-wide";
const GOLD = { color: "#B8960C" };
const $ = (v: string, className?: string) => <MoneyCell value={Number(v)} currency="ARS" decimals={2} className={className} />;

/**
 * Gastos (fase 5 adelantada): cada factura pagada de West Desarrolladora como gasto de su
 * unidad y, si la unidad es una propiedad o grupo de la app de alquileres, de esa
 * propiedad (Nevado Golf mitad y mitad). Sale de app.v_gastos: no se carga nada a mano.
 */
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: q } = await searchParams;
  const hoy = hoyArgentina();
  const mes = q && /^\d{4}-\d{2}$/.test(q) ? q : hoy.slice(0, 7);
  const gastos = await gastosDelMes(mes);
  const totales = totalesPorDestino(gastos);
  const total = totales.reduce((t, x) => t + Number(x.total), 0);
  const categorias = new Set(gastos.map((g) => g.categoria ?? "Sin categoría")).size;
  const [a, m] = mes.split("-");
  const futuro = mesVecino(mes, 1) > hoy.slice(0, 7);

  const tarjetas = [
    { label: "Gastado en el mes", v: total.toFixed(2), sub: `${gastos.length} ${gastos.length === 1 ? "renglón pagado" : "renglones pagados"}`, icon: Receipt, bg: "bg-[#B8960C]/10", color: "text-[#B8960C]" },
    { label: "Propiedades, grupos o unidades", n: totales.length, sub: "con algún gasto", icon: Building2, bg: "bg-[#1B4332]/10", color: "text-[#1B4332]" },
    { label: "Categorías", n: categorias, sub: "de la lista única", icon: Tags, bg: "bg-emerald-50", color: "text-emerald-600" },
  ];

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Gastos por propiedad</h1>
          <p className="text-sm text-muted-foreground">
            Cada factura pagada, en su unidad y en su propiedad o grupo de la app de alquileres. Fecha: salida de caja.
          </p>
        </div>
        {/* El mismo selector de mes que alquileres (MonthPicker), con links */}
        <div className="inline-flex h-[34px] items-center rounded-[8px] border bg-white px-1">
          <Link href={`/gastos?mes=${mesVecino(mes, -1)}`} aria-label="Mes anterior"
            className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#404040] hover:bg-muted">
            <ChevronLeft className="h-4 w-4" />
          </Link>
          <span className="min-w-[120px] text-center text-[13px] font-medium text-[#404040]">{MESES[Number(m) - 1]} {a}</span>
          {futuro ? (
            <span className="flex h-7 w-7 items-center justify-center text-[#c4c3bd]"><ChevronRight className="h-4 w-4" /></span>
          ) : (
            <Link href={`/gastos?mes=${mesVecino(mes, 1)}`} aria-label="Mes siguiente"
              className="flex h-7 w-7 items-center justify-center rounded-[6px] text-[#404040] hover:bg-muted">
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        {tarjetas.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.bg}`}>
              <c.icon className={`h-5 w-5 ${c.color}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              {"v" in c && c.v != null
                ? $(c.v, "block text-lg font-semibold text-primary")
                : <p className="text-lg font-semibold text-primary tabular-nums">{c.n}</p>}
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>

      {gastos.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay pagos en {MESES[Number(m) - 1].toLowerCase()} {a}.</p>
        </div>
      ) : (
        <>
          <section className="space-y-2">
            <h2 className="text-base font-semibold text-primary">Por propiedad, grupo o unidad</h2>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH} style={GOLD}>Dónde</TableHead>
                    <TableHead className={TH} style={GOLD}>Por categoría</TableHead>
                    <TableHead className={`text-right ${TH}`} style={GOLD}>Total</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {totales.map((t) => (
                    <TableRow key={t.donde} className="align-top">
                      <TableCell className="min-w-[200px] whitespace-normal font-medium">
                        {t.donde}{t.esUnidad && <span className="block text-xs font-normal text-muted-foreground">unidad sola</span>}
                      </TableCell>
                      <TableCell className="min-w-[260px] whitespace-normal">
                        <div className="max-w-md space-y-0.5 text-[12.5px] text-[#525252]">
                          {t.porCategoria.map((c) => (
                            <div key={c.categoria} className="flex justify-between gap-6"><span>{c.categoria}</span>{$(c.total)}</div>
                          ))}
                        </div>
                      </TableCell>
                      <TableCell className="text-right">{$(t.total, "font-semibold")}</TableCell>
                    </TableRow>
                  ))}
                  <TableRow className="bg-muted/30 hover:bg-muted/30">
                    <TableCell colSpan={2} className="font-semibold">Total del mes</TableCell>
                    <TableCell className="text-right">{$(total.toFixed(2), "font-semibold text-primary")}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </div>
          </section>

          <section className="space-y-2">
            <h2 className="text-base font-semibold text-primary">Detalle</h2>
            <div className="overflow-hidden rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH} style={GOLD}>Fecha</TableHead>
                    <TableHead className={TH} style={GOLD}>OP</TableHead>
                    <TableHead className={TH} style={GOLD}>Proveedor</TableHead>
                    <TableHead className={TH} style={GOLD}>Factura</TableHead>
                    <TableHead className={TH} style={GOLD}>Categoría</TableHead>
                    <TableHead className={TH} style={GOLD}>Propiedad o grupo</TableHead>
                    <TableHead className={`text-right ${TH}`} style={GOLD}>Importe</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {gastos.map((g, i) => (
                    <TableRow key={i}>
                      <TableCell>{formatDate(g.fecha)}</TableCell>
                      <TableCell><Link href={`/op/${g.op_numero}`} className="font-medium text-primary underline-offset-2 hover:underline">{g.op_numero}</Link></TableCell>
                      <TableCell className="min-w-[160px] whitespace-normal">{g.proveedor}</TableCell>
                      <TableCell>{g.tipo} {g.factura}</TableCell>
                      <TableCell className={g.categoria ? "" : "text-[#92400e]"}>{g.categoria ?? "Sin categoría"}</TableCell>
                      <TableCell className="whitespace-normal">
                        {g.destino ?? g.unidad}<span className="block text-xs text-muted-foreground">{g.unidad_codigo}</span>
                      </TableCell>
                      <TableCell className="text-right">{$(g.importe)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
