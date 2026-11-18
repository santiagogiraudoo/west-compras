import Link from "next/link";
import Decimal from "decimal.js";
import { Building2, ChevronRight, LayoutGrid, Rows3, TriangleAlert } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { resumenUnidades } from "@/lib/unidades/queries";

export const dynamic = "force-dynamic";

const $ = (v: Decimal.Value, className?: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";

/**
 * Unidades de negocio (como "Unidades" en Central de pagos): cuánto se le factura a cada
 * obra, propiedad o local, quién le vende más y cuánto falta pagar. En tarjetas o tabla;
 * tocar una abre su ficha.
 */
export default async function UnidadesPage({ searchParams }: { searchParams: Promise<{ vista?: string }> }) {
  const { vista } = await searchParams;
  const hoy = hoyArgentina();
  const [unidades, abiertos] = await Promise.all([resumenUnidades(hoy), listarAbiertos()]);
  const deuda = new Map<string, { deuda: Decimal; vencido: Decimal }>();
  for (const a of abiertos) {
    if (!a.unidad_codigo || Number(a.deuda) <= 0.5) continue;
    const d = deuda.get(a.unidad_codigo) ?? { deuda: new Decimal(0), vencido: new Decimal(0) };
    d.deuda = d.deuda.plus(a.deuda);
    if (a.vencimiento && a.vencimiento < hoy) d.vencido = d.vencido.plus(a.deuda);
    deuda.set(a.unidad_codigo, d);
  }
  const total90 = unidades.reduce((t, u) => t.plus(u.comprado_90), new Decimal(0));
  const max90 = Math.max(1, ...unidades.map((u) => Number(u.comprado_90)));
  const conMovimiento = unidades.filter((u) => Number(u.comprado_90) !== 0 || deuda.has(u.codigo));
  const quietas = unidades.length - conMovimiento.length;
  const tabla = vista === "tabla";

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Unidades</h1>
          <p className="text-sm text-muted-foreground">
            Lo facturado a cada obra, propiedad o local en los últimos 90 días ({$(total90, "font-medium text-foreground")}) y lo que falta pagar.
          </p>
        </div>
        <div className="flex gap-1 rounded-lg border border-border/60 bg-[#FFFEFC] p-1">
          {[{ k: "tarjetas", label: "Tarjetas", icon: LayoutGrid }, { k: "tabla", label: "Tabla", icon: Rows3 }].map((v) => (
            <Link key={v.k} href={v.k === "tabla" ? "/unidades?vista=tabla" : "/unidades"} scroll={false}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium ${(v.k === "tabla") === tabla ? "bg-[#1B4332] text-white" : "text-[#525252] hover:bg-[#f5f5f0]"}`}>
              <v.icon className="h-3.5 w-3.5" /> {v.label}
            </Link>
          ))}
        </div>
      </div>

      {tabla ? (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full min-w-[900px] text-[13px]">
            <thead className="border-b bg-[#fafaf7]">
              <tr>
                <th className={TH}>Unidad</th><th className={`${TH} text-right`}>Facturado 90 d</th><th className={TH}>Facturas</th>
                <th className={TH}>Le vende más</th><th className={`${TH} text-right`}>Falta pagar</th><th className={TH}>Última</th><th className="w-6" />
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f1ec]">
              {unidades.map((u) => {
                const d = deuda.get(u.codigo);
                return (
                  <tr key={u.codigo} className="group relative hover:bg-[#fafaf7]">
                    <td className="px-3 py-2.5">
                      <Link href={`/unidades/${u.codigo}`} className="font-medium text-primary after:absolute after:inset-0">{u.nombre}</Link>
                      <span className="block text-[11.5px] text-muted-foreground">{u.destino ?? u.codigo}</span>
                    </td>
                    <td className="px-3 py-2.5 text-right font-medium">{Number(u.comprado_90) ? $(u.comprado_90) : <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5 text-muted-foreground">{u.facturas_90} · {u.proveedores_90} prov.</td>
                    <td className="px-3 py-2.5">{u.top_proveedor ?? <span className="text-muted-foreground">—</span>}</td>
                    <td className="px-3 py-2.5 text-right">
                      {d ? $(d.deuda) : <span className="text-muted-foreground">—</span>}
                      {d && d.vencido.gt(0.5) && <span className="block text-[11px] text-red-700">{$(d.vencido)} vencido</span>}
                    </td>
                    <td className="px-3 py-2.5 whitespace-nowrap">{u.ultima ? formatDate(u.ultima) : "—"}</td>
                    <td className="px-2 text-muted-foreground/50 group-hover:text-primary"><ChevronRight className="h-4 w-4" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {conMovimiento.map((u) => {
              const d = deuda.get(u.codigo);
              const pct = total90.isZero() ? 0 : Math.round((Number(u.comprado_90) / total90.toNumber()) * 100);
              return (
                <Link key={u.codigo} href={`/unidades/${u.codigo}`}
                  className="group flex flex-col gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4 transition hover:-translate-y-0.5 hover:border-[#B8960C]/50 hover:shadow-md">
                  <div className="flex items-start gap-3">
                    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-[#1B4332]/10 text-[#1B4332]"><Building2 className="h-5 w-5" /></div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-primary">{u.nombre}</p>
                      <p className="truncate text-xs text-muted-foreground">{u.destino ?? `${u.codigo} · unidad sola`}</p>
                    </div>
                    <ChevronRight className="mt-1 h-4 w-4 text-[#c4c3bd] transition group-hover:translate-x-0.5 group-hover:text-[#B8960C]" />
                  </div>
                  <div>
                    <div className="flex items-baseline justify-between">
                      <span className="text-xs text-muted-foreground">Facturado 90 días</span>
                      <span className="text-xs text-muted-foreground">{pct} %</span>
                    </div>
                    {$(u.comprado_90, "text-xl font-semibold text-primary")}
                    <div className="mt-1.5 h-1.5 rounded-full bg-[#f0efe9]">
                      <div className="h-1.5 rounded-full bg-[#B8960C]" style={{ width: `${Math.max(1.5, (Number(u.comprado_90) / max90) * 100)}%` }} />
                    </div>
                  </div>
                  <dl className="grid grid-cols-2 gap-2 border-t border-[#f2f1ec] pt-3 text-xs">
                    <div><dt className="text-muted-foreground">Le vende más</dt><dd className="truncate font-medium">{u.top_proveedor ?? "—"}</dd></div>
                    <div><dt className="text-muted-foreground">Facturas · proveedores</dt><dd className="font-medium">{u.facturas_90} · {u.proveedores_90}</dd></div>
                    <div>
                      <dt className="text-muted-foreground">Falta pagar</dt>
                      <dd className="font-medium">{d ? $(d.deuda) : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground">Última factura</dt>
                      <dd className="font-medium">{u.ultima ? formatDate(u.ultima) : "—"}</dd>
                    </div>
                  </dl>
                  {d && d.vencido.gt(0.5) && (
                    <p className="flex items-center gap-1.5 rounded-md bg-[#fef2f2] px-2 py-1 text-[12px] font-medium text-[#991b1b]">
                      <TriangleAlert className="h-3.5 w-3.5" /> {$(d.vencido)} vencido
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
          {quietas > 0 && (
            <p className="text-xs text-muted-foreground">
              {quietas} {quietas === 1 ? "unidad sin" : "unidades sin"} facturas en 90 días ni deuda: están en la <Link href="/unidades?vista=tabla" className="font-medium text-primary hover:underline">tabla</Link>.
            </p>
          )}
        </>
      )}
    </div>
  );
}
