import Link from "next/link";
import Decimal from "decimal.js";
import { Banknote, ChevronLeft, ChevronRight, ExternalLink, FileText, Percent, Receipt, Search, type LucideIcon } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import type { Pagado } from "@/lib/op/queries";

const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];
const nombreMes = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(0, 4)}`;
const mover = (m: string, n: number) => new Date(Date.UTC(Number(m.slice(0, 4)), Number(m.slice(5, 7)) - 1 + n, 1)).toISOString().slice(0, 7);
const $ = (v: Decimal.Value, className?: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";

/**
 * Histórico de pagados, mes por mes: cuánto salió, cuántas OP, retenciones y por qué
 * medio; y cada pago con su orden y su comprobante. Incluye los de ClickUp, así es el
 * registro completo. Las compensaciones se ven, pero no suman a lo que salió de caja.
 */
export function Historico({ pagados, mes, hoy, q }: { pagados: Pagado[]; mes: string; hoy: string; q: string }) {
  const mesActual = hoy.slice(0, 7);
  const busca = q.trim().toLowerCase();
  const filas = busca
    ? pagados.filter((p) => [p.razon_social, p.numero, p.referencia_bancaria ?? "", p.medio_pago ?? ""].some((x) => x.toLowerCase().includes(busca)))
    : pagados;
  const deCaja = filas.filter((p) => p.medio_pago !== "Compensacion");
  const salio = deCaja.reduce((t, p) => t.plus(p.neto_transferir ?? p.total_imputado), new Decimal(0));
  const retenciones = deCaja.reduce((t, p) => t.plus(p.total_retenciones), new Decimal(0));
  const porMedio = new Map<string, Decimal>();
  for (const p of deCaja) porMedio.set(p.medio_pago || "Sin dato", (porMedio.get(p.medio_pago || "Sin dato") ?? new Decimal(0)).plus(p.neto_transferir ?? p.total_imputado));
  const medios = [...porMedio].sort((a, b) => b[1].comparedTo(a[1]));
  const link = (m: string) => `/op?paso=pagadas&mes=${m}${q ? `&q=${encodeURIComponent(q)}` : ""}`;

  const tarjetas: { label: string; v: React.ReactNode; nota: string; icon: LucideIcon; tono: string }[] = [
    { label: "Salió de caja", v: $(salio), nota: "neto transferido", icon: Banknote, tono: "bg-emerald-50 text-emerald-600" },
    { label: "Órdenes pagadas", v: String(deCaja.length), nota: `${deCaja.reduce((t, p) => t + p.facturas, 0)} facturas`, icon: FileText, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Retenciones", v: $(retenciones), nota: "ganancias, IVA, IIBB, SUSS", icon: Percent, tono: "bg-amber-50 text-amber-600" },
    { label: "Pago promedio", v: deCaja.length ? $(salio.div(deCaja.length)) : "—", nota: "por OP", icon: Receipt, tono: "bg-[#f5f5f0] text-[#737373]" },
  ];

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-1 rounded-lg border border-border/60 bg-[#FFFEFC] p-1">
          <Link href={link(mover(mes, -1))} scroll={false} className="rounded-md p-1.5 text-[#525252] hover:bg-[#f5f5f0]" aria-label="Mes anterior"><ChevronLeft className="h-4 w-4" /></Link>
          <span className="min-w-36 text-center text-sm font-semibold capitalize text-primary">{nombreMes(mes)}</span>
          {mes < mesActual
            ? <Link href={link(mover(mes, 1))} scroll={false} className="rounded-md p-1.5 text-[#525252] hover:bg-[#f5f5f0]" aria-label="Mes siguiente"><ChevronRight className="h-4 w-4" /></Link>
            : <span className="p-1.5 text-[#d4d4d0]"><ChevronRight className="h-4 w-4" /></span>}
        </div>
        <form action="/op" className="relative w-full max-w-xs">
          <input type="hidden" name="paso" value="pagadas" />
          <input type="hidden" name="mes" value={mes} />
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input name="q" defaultValue={q} placeholder="Buscar proveedor, OP, referencia o medio" className="h-8 pl-8 text-sm" />
        </form>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tarjetas.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tono}`}><c.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <div className="truncate text-lg font-semibold text-primary">{c.v}</div>
              <p className="text-xs text-muted-foreground">{c.nota}</p>
            </div>
          </div>
        ))}
      </div>

      {medios.length > 0 && (
        <div className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <p className="mb-2 text-xs font-semibold text-primary">Cómo se pagó</p>
          <div className="flex h-3 overflow-hidden rounded-full">
            {medios.map(([m, v], i) => (
              <div key={m} title={`${m}: $${v.toDecimalPlaces(0).toNumber().toLocaleString("es-AR")}`}
                style={{ flex: v.toNumber(), background: ["#1B4332", "#B8960C", "#2d6a4f", "#f59e0b", "#a3a3a3"][i % 5] }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs">
            {medios.map(([m, v], i) => (
              <span key={m} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-full" style={{ background: ["#1B4332", "#B8960C", "#2d6a4f", "#f59e0b", "#a3a3a3"][i % 5] }} />
                {m} {$(v, "font-medium text-primary")}
              </span>
            ))}
          </div>
        </div>
      )}

      {filas.length === 0 ? (
        <div className="rounded-lg border border-border/60 bg-white p-10 text-center text-sm text-muted-foreground">
          {pagados.length ? "Ningún pago con esa búsqueda." : `No hay pagos registrados en ${nombreMes(mes)}.`}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-md border bg-white">
          <table className="w-full min-w-[920px] text-[13px]">
            <thead className="border-b bg-[#fafaf7]">
              <tr>
                <th className={TH}>Salida</th><th className={TH}>OP</th><th className={TH}>Proveedor</th><th className={TH}>Medio</th>
                <th className={`${TH} text-right`}>Total</th><th className={`${TH} text-right`}>Retenciones</th><th className={`${TH} text-right`}>Neto</th>
                <th className={TH}>Papeles</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#f2f1ec]">
              {filas.map((p) => (
                <tr key={p.numero} className={`hover:bg-[#fafaf7] ${p.medio_pago === "Compensacion" ? "text-muted-foreground" : ""}`}>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {formatDate(p.fecha)}
                    {/* Un echeq o cheque diferido: está pagado pero la plata todavía no salió. */}
                    {p.fecha > hoy && <span className="block text-[11px] font-medium text-[#92400e]">todavía no salió</span>}
                  </td>
                  <td className="px-3 py-2.5 whitespace-nowrap">
                    {p.origen === "app"
                      ? <Link href={`/op/${p.numero}`} className="font-semibold text-primary underline-offset-2 hover:underline">{p.numero}</Link>
                      : <span className="font-semibold">{p.numero}</span>}
                    <span className="block text-[11px] text-muted-foreground">{p.origen === "app" ? "app" : "ClickUp"} · {p.facturas} {p.facturas === 1 ? "factura" : "facturas"}</span>
                  </td>
                  <td className="px-3 py-2.5"><Link href={`/cuenta/${p.proveedor_codigo}`} className="font-medium underline-offset-2 hover:text-primary hover:underline">{p.razon_social}</Link></td>
                  <td className="px-3 py-2.5">
                    {p.medio_pago === "Compensacion" ? <StatusPill tone="neutral">Compensación</StatusPill> : (p.medio_pago ?? "—")}
                    {p.referencia_bancaria && <span className="block max-w-[160px] truncate text-[11px] text-muted-foreground" title={p.referencia_bancaria}>{p.referencia_bancaria}</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">{$(p.total_imputado)}</td>
                  <td className="px-3 py-2.5 text-right">{Number(p.total_retenciones) ? $(p.total_retenciones, "text-[#92400e]") : <span className="text-muted-foreground">—</span>}</td>
                  <td className="px-3 py-2.5 text-right font-semibold">{$(p.neto_transferir ?? p.total_imputado)}</td>
                  <td className="px-3 py-2.5">
                    <span className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {p.orden_pago_link && <Papel href={p.orden_pago_link}>Orden</Papel>}
                      {p.comprobante_link ? <Papel href={p.comprobante_link}>Comprobante</Papel> : <span className="text-[11.5px] text-[#92400e]">sin comprobante</span>}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Papel({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 text-[12px] font-medium text-primary hover:underline">
      {children} <ExternalLink className="h-3 w-3 opacity-60" />
    </a>
  );
}
