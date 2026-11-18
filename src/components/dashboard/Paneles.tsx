import type { LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import type { MesCompra, TramoDeuda } from "@/lib/dashboard/calculos";

/**
 * Piezas del Dashboard, con el mismo dibujo que Finanzas de alquileres: tarjetas en
 * off-white, título verde con icono, barras hechas con CSS (alquileres no usa librería).
 */

const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const mesCorto = (m: string) => `${MESES[Number(m.slice(5, 7)) - 1]} ${m.slice(2, 4)}`;
const $ = (v: string | number, className?: string) => <MoneyCell value={Number(v)} currency="ARS" decimals={0} className={className} />;
/** Millones con una coma: lo que entra arriba de una barra. */
const millones = (v: string) => `${(Number(v) / 1e6).toLocaleString("es-AR", { maximumFractionDigits: 1 })} M`;

export function Panel({ icon: Icon, titulo, extra, children, className }: {
  icon: LucideIcon; titulo: string; extra?: React.ReactNode; children: React.ReactNode; className?: string;
}) {
  return (
    <div className={`rounded-lg border border-border/60 bg-[#FFFEFC] p-4 ${className ?? ""}`}>
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-primary">
        <Icon className="h-4 w-4" /> {titulo}
        {extra && <span className="ml-auto text-xs font-normal text-muted-foreground">{extra}</span>}
      </h3>
      {children}
    </div>
  );
}

export interface Kpi { label: string; v: React.ReactNode; sub: string; icon: LucideIcon; tono: string }

export function Kpis({ kpis }: { kpis: Kpi[] }) {
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-5">
      {kpis.map((k) => (
        <div key={k.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
          <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${k.tono}`}><k.icon className="h-5 w-5" /></div>
          <div className="min-w-0">
            <p className="text-xs font-medium text-muted-foreground">{k.label}</p>
            <div className="truncate text-lg font-semibold text-primary">{k.v}</div>
            <p className="text-xs text-muted-foreground">{k.sub}</p>
          </div>
        </div>
      ))}
    </div>
  );
}

/** Comprado contra pagado, mes por mes: dorado lo que entró, verde lo que salió. */
export function CompradoPagado({ serie, hoy }: { serie: MesCompra[]; hoy: string }) {
  const max = Math.max(1, ...serie.flatMap((m) => [Number(m.comprado), Number(m.pagado)]));
  const alto = (v: string) => `${Math.max(0, (Number(v) / max) * 100)}%`;
  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#B8960C]" /> Comprado (facturas por su fecha)</span>
        <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm bg-[#1B4332]" /> Pagado (por salida de caja)</span>
      </div>
      <div className="grid h-48 items-end gap-3" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
        {serie.map((m) => (
          <div key={m.mes} className="flex h-full items-end justify-center gap-1">
            {(["comprado", "pagado"] as const).map((k) => (
              <div key={k} className="flex h-full w-[38%] max-w-10 flex-col justify-end" title={`${mesCorto(m.mes)} · ${k}: $${Number(m[k]).toLocaleString("es-AR", { maximumFractionDigits: 0 })}`}>
                <span className="mb-1 text-center text-[10px] tabular-nums text-muted-foreground">{Number(m[k]) > 0 ? millones(m[k]) : ""}</span>
                <div className={`rounded-t-[3px] ${k === "comprado" ? "bg-[#B8960C]" : "bg-[#1B4332]"}`} style={{ height: alto(m[k]) }} />
              </div>
            ))}
          </div>
        ))}
      </div>
      <div className="mt-2 grid gap-3 border-t border-[#eeede8] pt-2" style={{ gridTemplateColumns: `repeat(${serie.length}, minmax(0, 1fr))` }}>
        {serie.map((m) => (
          <span key={m.mes} className="text-center text-[11px] text-muted-foreground">
            {mesCorto(m.mes)}{m.mes === hoy.slice(0, 7) ? " (en curso)" : ""}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Un renglón con barra horizontal: para el embudo y los rankings. */
export function Barra({ label, valor, max, sub, color = "bg-[#1B4332]", href }: {
  label: string; valor: string; max: number; sub?: string; color?: string; href?: string;
}) {
  const pct = max > 0 ? Math.max(1.5, (Math.abs(Number(valor)) / max) * 100) : 0;
  const nombre = href ? <a href={href} className="text-primary underline-offset-2 hover:underline">{label}</a> : <span className="text-primary">{label}</span>;
  return (
    <div className="space-y-1">
      <div className="flex items-baseline gap-2 text-xs">
        <span className="min-w-0 truncate font-medium">{nombre}</span>
        {sub && <span className="shrink-0 text-muted-foreground">{sub}</span>}
        {$(valor, "ml-auto shrink-0 text-primary")}
      </div>
      <div className="h-1.5 rounded-full bg-[#f0efe9]">
        <div className={`h-1.5 rounded-full ${color}`} style={{ width: `${Number(valor) > 0 ? pct : 0}%` }} />
      </div>
    </div>
  );
}

// La rampa de alquileres (AgingPanel), con verde para lo que está al día.
const RAMPA = ["#1B4332", "#f87171", "#ef4444", "#dc2626", "#991b1b"];

export function Antiguedad({ tramos }: { tramos: TramoDeuda[] }) {
  const positivos = tramos.map((t) => Math.max(0, Number(t.monto)));
  return (
    <div>
      <div className="flex h-[26px] gap-[2px] overflow-hidden rounded">
        {tramos.map((t, i) => positivos[i] > 0 && (
          <div key={t.tramo} style={{ flex: positivos[i], background: RAMPA[i] }} title={`${t.tramo}: $${positivos[i].toLocaleString("es-AR", { maximumFractionDigits: 0 })}`} />
        ))}
      </div>
      <div className="mt-3 space-y-1.5">
        {tramos.map((t, i) => (
          <div key={t.tramo} className="flex items-center gap-2 text-xs">
            <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: RAMPA[i] }} />
            <span className="font-medium text-primary">{i === 0 ? "Al día" : `Vencido ${t.tramo}`}</span>
            <span className="text-muted-foreground">{t.facturas} {t.facturas === 1 ? "factura" : "facturas"}</span>
            {$(t.monto, "ml-auto text-primary")}
          </div>
        ))}
      </div>
    </div>
  );
}

/** Un tiempo del flujo: días, con una nota de qué se mide. */
export function Tiempo({ label, dias, nota, alerta }: { label: string; dias: number | null; nota: string; alerta?: boolean }) {
  return (
    <div className="flex items-baseline gap-3 border-b border-[#f2f1ec] py-2 last:border-b-0">
      <div className="min-w-0 flex-1">
        <p className="text-xs font-medium text-primary">{label}</p>
        <p className="text-[11px] text-muted-foreground">{nota}</p>
      </div>
      <span className={`shrink-0 text-lg font-semibold tabular-nums ${alerta ? "text-[#b91c1c]" : "text-primary"}`}>
        {dias == null ? "—" : `${dias} ${Math.abs(dias) === 1 ? "día" : "días"}`}
      </span>
    </div>
  );
}
