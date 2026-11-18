import Link from "next/link";
import Decimal from "decimal.js";
import { ChevronRight, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import { hoyArgentina, listarOPAbiertas } from "@/lib/cuenta/queries";
import { listarOPsApp, type OPConLineas } from "@/lib/op/queries";
import type { EstadoOP } from "@/lib/op/estados";
import { vencimientoOP } from "@/lib/op/pago";

export const dynamic = "force-dynamic";

const TH = "text-xs font-semibold uppercase tracking-wide";
const GOLD = { color: "#B8960C" };

/** Primero lo que frena, después lo que espera a alguien, al final lo listo para pagar. */
const GRUPOS: { estado: EstadoOP; titulo: string; nota: string }[] = [
  { estado: "Bloqueada", titulo: "Bloqueadas", nota: "No se pagan así hasta que se resuelva" },
  { estado: "Observada", titulo: "Observadas", nota: "Frenadas hasta resolver o quitar la observación" },
  { estado: "A aprobar", titulo: "A aprobar", nota: "Esperan la decisión de cada aprobador" },
  { estado: "En armado", titulo: "En armado", nota: "Falta mandarlas a aprobar" },
  { estado: "Autorizada", titulo: "Autorizadas", nota: "Todo aprobado: están en Para pagar" },
];

/**
 * Órdenes de pago: las armadas en la app por estado (En armado → A aprobar → Autorizada →
 * Pagada) y, abajo, las Previstas que siguen en ClickUp. Tocar una abre su ficha.
 */
export default async function OPPage() {
  const [ops, deClickUp] = await Promise.all([listarOPsApp(), listarOPAbiertas()]);
  const hoy = hoyArgentina();

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-primary">Órdenes de pago</h1>
          <p className="text-sm text-muted-foreground">
            Se arman eligiendo facturas, se mandan a aprobar y, autorizadas, pasan a <Link href="/pagos" className="text-primary underline-offset-2 hover:underline">Para pagar</Link>.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/op/nueva"><FilePlus className="h-4 w-4" /> Nueva OP</Link>
        </Button>
      </div>

      {ops.length === 0 && (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay OP abiertas armadas en la app.</p>
        </div>
      )}

      {GRUPOS.map((g) => {
        const filas = ops.filter((o) => o.estado === g.estado);
        if (filas.length === 0) return null;
        const total = filas.reduce((t, o) => t.plus(o.total_imputado), new Decimal(0));
        return (
          <section key={g.estado} className="space-y-2">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
              <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
                {g.titulo}
                <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{filas.length}</span>
              </h2>
              <span className="text-xs text-muted-foreground">{g.nota}</span>
              <MoneyCell value={total.toNumber()} currency="ARS" decimals={0} className="ml-auto text-sm font-semibold text-primary" />
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className={TH} style={GOLD}>OP</TableHead>
                    <TableHead className={TH} style={GOLD}>Proveedor</TableHead>
                    <TableHead className={TH} style={GOLD}>Unidades</TableHead>
                    <TableHead className={TH} style={GOLD}>Aprobación</TableHead>
                    <TableHead className={TH} style={GOLD}>Vence</TableHead>
                    <TableHead className={`text-right ${TH}`} style={GOLD}>Total</TableHead>
                    <TableHead className="w-8" />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filas.map((o) => <FilaOP key={o.numero} o={o} hoy={hoy} />)}
                </TableBody>
              </Table>
            </div>
          </section>
        );
      })}

      {deClickUp.length > 0 && (
        <section className="space-y-2">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
              Previstas en ClickUp
              <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{deClickUp.length}</span>
            </h2>
            <span className="text-xs text-muted-foreground">Se aprueban y pagan allá hasta que se apaguen las listas Pagos y CC.</span>
          </div>
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH} style={GOLD}>OP</TableHead>
                  <TableHead className={TH} style={GOLD}>Proveedor</TableHead>
                  <TableHead className={TH} style={GOLD}>Fecha</TableHead>
                  <TableHead className={TH} style={GOLD}>En ClickUp</TableHead>
                  <TableHead className={`text-right ${TH}`} style={GOLD}>Total</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {deClickUp.map((o) => (
                  <TableRow key={o.numero}>
                    <TableCell className="font-semibold">{o.numero}</TableCell>
                    <TableCell className="min-w-[180px] whitespace-normal">{o.razon_social}</TableCell>
                    <TableCell>{formatDate(o.fecha_op)}</TableCell>
                    <TableCell><StatusPill tone="neutral">{o.estado_clickup ?? o.estado}</StatusPill></TableCell>
                    <TableCell className="text-right"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={0} /></TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </section>
      )}
    </div>
  );
}

function FilaOP({ o, hoy }: { o: OPConLineas; hoy: string }) {
  const vence = vencimientoOP(o.lineas);
  const aprobados = o.lineas.filter((l) => l.decision === "Aprobada").length;
  const unidades = [...new Set(o.lineas.map((l) => l.unidad_nombre || l.unidad))].join(", ");
  return (
    <TableRow className="group relative">
      <TableCell>
        {/* El link cubre toda la fila: tocar cualquier lado abre la ficha */}
        <Link href={`/op/${o.numero}`} className="font-semibold text-primary after:absolute after:inset-0">{o.numero}</Link>
      </TableCell>
      <TableCell className="min-w-[180px] whitespace-normal">{o.razon_social}</TableCell>
      <TableCell className="whitespace-normal text-muted-foreground">{unidades}</TableCell>
      <TableCell>
        <span className="flex items-center gap-2">
          <span className="flex w-16 gap-0.5" aria-hidden>
            {o.lineas.map((l) => (
              <span key={`${l.id}-${l.unidad}`} className={`h-1.5 flex-1 rounded-full ${
                l.decision === "Aprobada" ? "bg-[#1B4332]" : l.decision === "Bloqueada" ? "bg-[#dc2626]"
                  : l.decision === "Observada" ? "bg-[#ea580c]" : "bg-[#e8e8e3]"
              }`} />
            ))}
          </span>
          <span className="text-xs tabular-nums text-muted-foreground">{aprobados}/{o.lineas.length}</span>
        </span>
      </TableCell>
      <TableCell className={vence && vence < hoy ? "font-medium text-[#b91c1c]" : ""}>{vence ? formatDate(vence) : "—"}</TableCell>
      <TableCell className="text-right"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={0} className="font-semibold" /></TableCell>
      <TableCell className="text-muted-foreground/50 group-hover:text-primary"><ChevronRight className="h-4 w-4" /></TableCell>
    </TableRow>
  );
}
