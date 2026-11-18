import Link from "next/link";
import { ChevronRight, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";

export type Paso = "armar" | "aprobar" | "pagar" | "pagadas" | "clickup";

export interface PasoInfo {
  clave: Paso;
  numero?: number;
  label: string;
  icon: LucideIcon;
  n: number;
  total: string;
  /** Algo que pide atención en este paso (ej.: te toca firmar): pinta el contador de dorado. */
  aviso?: string;
}

/**
 * El flujo de una OP en una fila: 1 Armar → 2 Aprobar → 3 Pagar, y al costado lo cerrado
 * y lo que sigue en ClickUp. Cada paso es un link (?paso=…): la página es una sola.
 */
export function PasosOP({ pasos, activo }: { pasos: PasoInfo[]; activo: Paso }) {
  const flujo = pasos.filter((p) => p.numero);
  const aparte = pasos.filter((p) => !p.numero);
  return (
    <nav className="flex flex-wrap items-stretch gap-2" aria-label="Pasos de la orden de pago">
      <div className="flex min-w-0 flex-1 items-stretch gap-1 rounded-xl border border-border/60 bg-[#FFFEFC] p-1.5">
        {flujo.map((p, i) => (
          <div key={p.clave} className="flex min-w-0 flex-1 items-center gap-1">
            <Tab p={p} activo={activo === p.clave} />
            {i < flujo.length - 1 && <ChevronRight className="h-4 w-4 shrink-0 text-[#c4c3bd]" />}
          </div>
        ))}
      </div>
      <div className="flex items-stretch gap-1 rounded-xl border border-border/60 bg-[#FFFEFC] p-1.5">
        {aparte.map((p) => <Tab key={p.clave} p={p} activo={activo === p.clave} chico />)}
      </div>
    </nav>
  );
}

function Tab({ p, activo, chico }: { p: PasoInfo; activo: boolean; chico?: boolean }) {
  return (
    <Link href={`/op?paso=${p.clave}`} scroll={false}
      className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 transition ${
        activo ? "bg-[#1B4332] text-white shadow-sm" : "text-[#525252] hover:bg-[#f5f5f0]"
      }`}>
      <span className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[12px] font-semibold ${
        activo ? "bg-white/15 text-[#e9d27a]" : "bg-[#f0efe9] text-[#8a8a85]"
      }`}>
        {p.numero ?? <p.icon className="h-4 w-4" />}
      </span>
      <span className="min-w-0">
        <span className="flex items-center gap-1.5 text-[13px] font-semibold">
          {p.label}
          <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${
            p.aviso ? "bg-[#B8960C] text-white" : activo ? "bg-white/15" : "bg-[#f0efe9] text-[#737373]"
          }`}>{p.n}</span>
        </span>
        {!chico && (
          <span className={`block truncate text-[11.5px] ${activo ? "text-white/70" : "text-muted-foreground"}`}>
            {p.aviso ?? (Number(p.total) ? <MoneyCell value={Number(p.total)} currency="ARS" decimals={0} /> : "nada")}
          </span>
        )}
      </span>
    </Link>
  );
}
