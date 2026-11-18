import Link from "next/link";
import Decimal from "decimal.js";
import { Ban, CheckCircle, ChevronRight, Clock, FilePlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill, type PillTone } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import { hoyArgentina, listarOPAbiertas, type FilaOP } from "@/lib/cuenta/queries";
import { estadoAprobacion, vencimientoOP, type EstadoAprobacion } from "@/lib/op/pago";

export const dynamic = "force-dynamic";

type Grupo = EstadoAprobacion | "ClickUp";

const GRUPOS: { clave: Grupo; titulo: string; nota: string; tone: PillTone; icon: LucideIcon }[] = [
  { clave: "Observada", titulo: "Observadas", nota: "Frenadas hasta resolver la observación", tone: "red", icon: Ban },
  { clave: "A aprobar", titulo: "A aprobar", nota: "Esperan la decisión de cada factura", tone: "amber", icon: Clock },
  { clave: "Autorizada", titulo: "Autorizadas", nota: "Todas sus facturas aprobadas: ya están en Pagos", tone: "success", icon: CheckCircle },
  { clave: "ClickUp", titulo: "De ClickUp", nota: "Se aprueban y se pagan allá hasta que se apaguen las listas", tone: "neutral", icon: Clock },
];

/**
 * OP abiertas (Previstas) de West Desarrolladora, agrupadas por dónde están: primero lo
 * que frena, después lo que espera decisión. Tocar una abre su ficha, donde se aprueba.
 */
export default async function OPPage() {
  const ops = await listarOPAbiertas();
  const hoy = hoyArgentina();
  const grupoDe = (o: FilaOP): Grupo => (o.origen === "app" ? estadoAprobacion(o.facturas) : "ClickUp");

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Órdenes de pago</h1>
          <p className="text-sm text-muted-foreground">Previstas: reservadas con sus facturas, todavía sin pagar. Una factura observada frena toda la OP.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/op/nueva"><FilePlus className="h-4 w-4" /> Nueva OP</Link>
        </Button>
      </div>

      {ops.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay OP abiertas.</p>
        </div>
      ) : (
        GRUPOS.map((g) => {
          const filas = ops.filter((o) => grupoDe(o) === g.clave);
          if (filas.length === 0) return null;
          const total = filas.reduce((t, o) => t.plus(o.total_imputado), new Decimal(0));
          return (
            <section key={g.clave} className="space-y-2">
              <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
                  {g.titulo}
                  <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{filas.length}</span>
                </h2>
                <span className="text-xs text-muted-foreground">{g.nota}</span>
                <MoneyCell value={total.toNumber()} currency="ARS" decimals={2} className="ml-auto text-sm font-semibold text-primary" />
              </div>
              <div className="rounded-md border overflow-hidden">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>OP</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Paga</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Aprobación</TableHead>
                      <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Vence</TableHead>
                      <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Total</TableHead>
                      <TableHead className="w-8" />
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filas.map((o) => {
                      const vivas = o.facturas.filter((f) => Number(f.importe) !== 0);
                      const vence = vencimientoOP(o.facturas);
                      return (
                        <TableRow key={o.numero} className="group relative">
                          <TableCell>
                            {/* El link cubre toda la fila: tocar cualquier lado abre la ficha */}
                            <Link href={`/op/${o.numero}`} className="font-semibold text-primary after:absolute after:inset-0">
                              {o.numero}
                            </Link>
                          </TableCell>
                          <TableCell className="min-w-[180px] whitespace-normal">{o.razon_social}</TableCell>
                          <TableCell className="whitespace-normal text-muted-foreground">{o.titular ?? "—"}</TableCell>
                          <TableCell>
                            {o.origen === "app" ? (
                              <span className="flex items-center gap-2">
                                <span className="flex w-16 gap-0.5" aria-hidden>
                                  {vivas.map((f) => (
                                    <span key={f.id} className={`h-1.5 flex-1 rounded-full ${
                                      f.decision === "Aprobada" ? "bg-[#1B4332]" : f.decision === "Observada" ? "bg-[#dc2626]" : "bg-[#e8e8e3]"
                                    }`} />
                                  ))}
                                </span>
                                <span className="text-xs text-muted-foreground tabular-nums">
                                  {vivas.filter((f) => f.decision === "Aprobada").length}/{vivas.length}
                                </span>
                              </span>
                            ) : (
                              <StatusPill tone="neutral">{o.estado_clickup ?? o.estado}</StatusPill>
                            )}
                          </TableCell>
                          <TableCell className={vence && vence < hoy ? "font-medium text-[#b91c1c]" : ""}>
                            {vence ? formatDate(vence) : "—"}
                          </TableCell>
                          <TableCell className="text-right">
                            <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} className="font-semibold" />
                          </TableCell>
                          <TableCell className="text-muted-foreground/50 group-hover:text-primary">
                            <ChevronRight className="h-4 w-4" />
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </section>
          );
        })
      )}
    </div>
  );
}
