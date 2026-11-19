import Link from "next/link";
import Decimal from "decimal.js";
import { CheckCircle, TriangleAlert } from "lucide-react";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { evaluarEspejo, resumirEspejo } from "@/lib/espejo/calculos";
import { filasEspejo } from "@/lib/espejo/queries";
import { formatDate } from "@/lib/utils";

export const dynamic = "force-dynamic";

const $ = (v: string) => <MoneyCell value={new Decimal(v).toNumber()} currency="ARS" decimals={0} />;
const COLS = "grid grid-cols-[110px_minmax(0,1.2fr)_96px_110px_minmax(0,2fr)_minmax(0,1fr)] items-start gap-x-3";

/**
 * Modo espejo (docs/proyecto/11_espejo.md): ClickUp opera y la app mira lo mismo con sus
 * reglas. Cada OP real con lo que habría pasado en la app: si cruzan compra, remito y factura
 * (se aprueba una sola vez) y si el proveedor tiene el alta para pagar.
 */
export default async function EspejoPage() {
  const ops = evaluarEspejo(await filasEspejo(45));
  const r = resumirEspejo(ops);
  return (
    <div className="mx-auto max-w-7xl space-y-5 px-8 py-6">
      <TituloDePestana label="Espejo" />
      <div>
        <h1 className="text-2xl font-bold text-primary">Espejo de ClickUp</h1>
        <p className="text-sm text-muted-foreground">
          Las OP reales de los últimos 45 días, vistas con las reglas de la app. ClickUp sigue siendo lo que opera: esto mide qué falta para pasar.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-4">
        <Dato titulo="OP miradas" valor={String(r.total)} nota={<>por {$(r.monto)}</>} />
        <Dato titulo="Cruzarían las tres puntas" valor={`${r.cruzan} de ${r.total}`} nota="con tope cargado, salen aprobadas solas" />
        <Dato titulo="Proveedor sin alta completa" valor={String(r.sinAlta)} nota="la app no deja pagarlas" />
        <div className="rounded-lg border bg-white p-3 text-xs">
          <p className="font-medium text-foreground">Por qué no cruzan</p>
          <ul className="mt-1 space-y-0.5 text-muted-foreground">
            {r.motivos.slice(0, 5).map((m) => <li key={m.motivo}>{m.motivo}: <span className="font-medium text-foreground">{m.ops}</span></li>)}
            {r.motivos.length === 0 && <li>Todas cruzan.</li>}
          </ul>
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border bg-white">
        <div className={`${COLS} border-b bg-[#FFFEFC] px-4 py-2 text-[11px] font-medium text-muted-foreground`}>
          <span>OP</span><span>Proveedor</span><span>ClickUp</span><span className="text-right">Total</span><span>En la app</span><span>Alta del proveedor</span>
        </div>
        {ops.length === 0 && <p className="p-6 text-sm text-muted-foreground">No hay OP de ClickUp en los últimos 45 días.</p>}
        {ops.map((op) => (
          <div key={op.numero} className={`${COLS} border-b px-4 py-2.5 text-sm last:border-b-0`}>
            <div>
              <span className="block font-medium">{op.numero}</span>
              <span className="text-xs text-muted-foreground">{formatDate(op.fecha)} · {op.origen}</span>
            </div>
            <span className="truncate">{op.proveedor}</span>
            <StatusPill tone={op.estado === "Pagada" ? "success" : "amber"} size="sm">{op.estado}</StatusPill>
            <span className="text-right">{$(op.total)}</span>
            <div className="min-w-0 text-xs">
              <span className={`flex items-center gap-1.5 font-medium ${op.cruza ? "text-[#1B4332]" : "text-[#92400e]"}`}>
                {op.cruza ? <CheckCircle className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />}
                {op.cruza ? "Cruza: se aprobaría una sola vez" : op.facturas.length ? "Pediría firma" : "Sin facturas ligadas en ClickUp"}
              </span>
              {op.facturas.filter((f) => f.motivos.length).map((f) => (
                <span key={f.id} className="block text-muted-foreground">
                  <Link href={`/bandeja/${f.id}`} className="text-primary hover:underline">{f.numero}</Link>: {f.motivos.join(", ")}
                </span>
              ))}
            </div>
            <span className={`text-xs ${op.faltaAlta.length ? "text-[#92400e]" : "text-[#1B4332]"}`}>
              {op.faltaAlta.length ? `Falta ${op.faltaAlta.join(", ")}` : "Completa"}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function Dato({ titulo, valor, nota }: { titulo: string; valor: string; nota: React.ReactNode }) {
  return (
    <div className="rounded-lg border bg-white p-3">
      <p className="text-xs text-muted-foreground">{titulo}</p>
      <p className="text-xl font-semibold text-primary">{valor}</p>
      <p className="text-xs text-muted-foreground">{nota}</p>
    </div>
  );
}
