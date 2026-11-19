import Link from "next/link";
import Decimal from "decimal.js";
import { CalendarRange } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import type { SemanaCaja } from "@/lib/dashboard/calculos";

const $ = (v: Decimal.Value, className?: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} className={className} />;
const COLOR = { en_op: "#1B4332", sin_op: "#B8960C", comprometido: "#6366f1" } as const;
const MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];
const dia = (f: string) => `${Number(f.slice(8, 10))} ${MESES[Number(f.slice(5, 7)) - 1]}`;

/**
 * La caja de las próximas semanas (como "Caja: próximas 8 semanas" de Central de pagos):
 * cada semana cuánto vence con OP, cuánto falta armar y cuánto sale en echeqs o cheques
 * ya entregados. La semana de hoy se marca; lo vencido va arriba.
 */
export function Caja({ semanas, hoy }: { semanas: SemanaCaja[]; hoy: string }) {
  const total = (s: SemanaCaja) => new Decimal(s.en_op).plus(s.sin_op).plus(s.comprometido);
  const max = Math.max(1, ...semanas.map((s) => total(s).toNumber()));
  const faltaArmar = semanas.reduce((t, s) => t.plus(s.sin_op), new Decimal(0));
  return (
    <section className="rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
      <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-primary">
          <CalendarRange className="h-4 w-4" /> La caja de las próximas semanas
          <span className="font-normal text-muted-foreground">· por vencimiento</span>
        </h2>
        <div className="flex flex-wrap gap-3 text-[11.5px] text-muted-foreground">
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.en_op }} /> Ya en OP</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.sin_op }} /> Falta armar la OP</span>
          <span className="flex items-center gap-1.5"><span className="h-2.5 w-2.5 rounded-sm" style={{ background: COLOR.comprometido }} /> Echeqs y cheques entregados</span>
        </div>
      </div>
      <div className="space-y-1.5">
        {semanas.map((s) => {
          const t = total(s);
          const actual = s.hasta != null && s.desde <= hoy && hoy <= s.hasta;
          const vencido = s.desde === "vencido";
          return (
            <div key={s.desde} className={`grid grid-cols-[110px_minmax(0,1fr)_110px] items-center gap-3 rounded-md px-2 py-1.5 ${actual ? "bg-[#f0f6f2]" : ""}`}>
              <span className={`text-[12px] ${vencido ? "font-semibold text-red-700" : actual ? "font-semibold text-primary" : "text-[#525252]"}`}>
                {vencido ? "Ya vencido" : actual ? "Esta semana" : `${dia(s.desde)} – ${dia(s.hasta!)}`}
              </span>
              <div className="flex h-4 overflow-hidden rounded-[3px] bg-[#f0efe9]" title={`OP ${s.en_op} · sin OP ${s.sin_op} · entregado ${s.comprometido}`}>
                {(["en_op", "sin_op", "comprometido"] as const).map((k) => Number(s[k]) > 0 && (
                  <div key={k} style={{ width: `${(Number(s[k]) / max) * 100}%`, background: vencido && k === "sin_op" ? "#dc2626" : COLOR[k] }} />
                ))}
              </div>
              <span className="text-right text-[12.5px]">
                {t.gt(0) ? $(t, "font-medium") : <span className="text-muted-foreground">—</span>}
                {Number(s.sin_op) > 0.5 && <span className={`block text-[10.5px] ${vencido ? "text-red-700" : "text-[#92400e]"}`}>{$(s.sin_op)} sin OP</span>}
              </span>
            </div>
          );
        })}
      </div>
      {faltaArmar.gt(0.5) && (
        <p className="mt-3 border-t border-[#f2f1ec] pt-2 text-xs text-muted-foreground">
          En estas semanas falta armar OP por {$(faltaArmar, "font-medium text-[#92400e]")}.{" "}
          <Link href="/op?paso=armar" className="font-medium text-primary hover:underline">Ir a armar</Link>
        </p>
      )}
    </section>
  );
}
