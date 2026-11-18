import Link from "next/link";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { gastosDelMes } from "@/lib/gastos/queries";
import { mesVecino, totalesPorDestino } from "@/lib/gastos/calculos";

export const dynamic = "force-dynamic";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const $ = (v: string) => <MoneyCell value={Number(v)} currency="ARS" decimals={2} />;

/**
 * Gastos (fase 5 adelantada): cada factura pagada de West Desarrolladora como gasto de su
 * unidad y, si la unidad es una propiedad o grupo de la app de alquileres, de esa
 * propiedad (Nevado Golf mitad y mitad). Sale de app.v_gastos: no se carga nada a mano.
 */
export default async function GastosPage({ searchParams }: { searchParams: Promise<{ mes?: string }> }) {
  const { mes: q } = await searchParams;
  const mes = q && /^\d{4}-\d{2}$/.test(q) ? q : hoyArgentina().slice(0, 7);
  const gastos = await gastosDelMes(mes);
  const totales = totalesPorDestino(gastos);
  const total = totales.reduce((t, x) => t + Number(x.total), 0);
  const [a, m] = mes.split("-");

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold text-primary">Gastos por propiedad</h1>
          <p className="text-sm text-muted-foreground">
            Cada factura pagada, en su unidad y en su propiedad o grupo de la app de alquileres. Fecha: salida de caja.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" asChild><Link href={`/gastos?mes=${mesVecino(mes, -1)}`}><ChevronLeft className="h-4 w-4" /> Anterior</Link></Button>
          <span className="w-36 text-center text-sm font-medium capitalize">{MESES[Number(m) - 1]} {a}</span>
          <Button size="sm" variant="outline" asChild><Link href={`/gastos?mes=${mesVecino(mes, 1)}`}>Siguiente <ChevronRight className="h-4 w-4" /></Link></Button>
        </div>
      </div>

      {gastos.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No hay pagos en este mes.</p>
      ) : (
        <>
          <section className="overflow-x-auto rounded-md border bg-card">
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="px-4 py-2">Propiedad, grupo o unidad</th><th className="px-2">Por categoría</th><th className="px-4 text-right">Total</th></tr>
              </thead>
              <tbody>
                {totales.map((t) => (
                  <tr key={t.donde} className="border-t align-top">
                    <td className="px-4 py-2">{t.donde}{t.esUnidad && <span className="text-xs text-muted-foreground"> (unidad sola)</span>}</td>
                    <td className="px-2 py-2 text-xs text-muted-foreground">
                      {t.porCategoria.map((c) => <div key={c.categoria} className="flex justify-between gap-4"><span>{c.categoria}</span>{$(c.total)}</div>)}
                    </td>
                    <td className="px-4 py-2 text-right font-medium">{$(t.total)}</td>
                  </tr>
                ))}
                <tr className="border-t font-semibold"><td className="px-4 py-2" colSpan={2}>Total del mes</td><td className="px-4 py-2 text-right">{$(total.toFixed(2))}</td></tr>
              </tbody>
            </table>
          </section>

          <section className="overflow-x-auto rounded-md border bg-card">
            <h2 className="border-b px-4 py-2 text-sm font-medium">Detalle</h2>
            <table className="w-full text-sm [&_td]:whitespace-nowrap">
              <thead className="text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-2">Fecha</th><th className="px-2">OP</th><th className="px-2">Proveedor</th><th className="px-2">Factura</th>
                  <th className="px-2">Categoría</th><th className="px-2">Unidad</th><th className="px-2">Propiedad o grupo</th><th className="px-4 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                {gastos.map((g, i) => (
                  <tr key={i} className="border-t">
                    <td className="px-4 py-1.5">{formatDate(g.fecha)}</td>
                    <td className="px-2 py-1.5">{g.op_numero}</td>
                    <td className="px-2 py-1.5">{g.proveedor}</td>
                    <td className="px-2 py-1.5">{g.tipo} {g.factura}</td>
                    <td className="px-2 py-1.5">{g.categoria ?? "—"}</td>
                    <td className="px-2 py-1.5">{g.unidad}</td>
                    <td className="px-2 py-1.5">{g.destino ?? "—"}</td>
                    <td className="px-4 py-1.5 text-right">{$(g.importe)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </div>
  );
}
