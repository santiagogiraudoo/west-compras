import Link from "next/link";
import { Ban, CheckCircle, Clock, FilePlus, type LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import { Monto } from "@/components/cuenta/DeudaPorProveedor";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill, type PillTone } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import { listarOPAbiertas } from "@/lib/cuenta/queries";
import { auth } from "@/lib/auth";
import { estadoAprobacion, type EstadoAprobacion } from "@/lib/op/pago";
import { AnularOP } from "./AnularOP";
import { DecidirLinea } from "./DecidirLinea";

export const dynamic = "force-dynamic";

const PILL: Record<EstadoAprobacion, { tone: PillTone; icon: LucideIcon }> = {
  "A aprobar": { tone: "amber", icon: Clock },
  Observada: { tone: "red", icon: Ban },
  Autorizada: { tone: "success", icon: CheckCircle },
};

/**
 * OP abiertas (Previstas) de West Desarrolladora con sus facturas. Las armadas en la app
 * se aprueban acá línea por línea (rol admin); autorizadas, pasan a Pagos.
 */
export default async function OPPage() {
  const [ops, session] = await Promise.all([listarOPAbiertas(), auth()]);
  const aprueba = session?.user?.role === "admin";
  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Órdenes de pago abiertas</h1>
          <p className="text-sm text-muted-foreground">Previstas: reservadas con sus facturas, todavía sin pagar. Una línea observada frena toda la OP.</p>
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
        <div className="space-y-3">
          {ops.map((o) => {
            const app = o.origen === "app";
            const estado = estadoAprobacion(o.facturas);
            return (
            <div key={o.numero} className="rounded-md border overflow-hidden bg-white">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b bg-muted/30 px-4 py-3">
                <div>
                  <span className="font-semibold text-primary">{o.numero}</span>
                  <span className="ml-2 text-sm">
                    <Link href={`/cuenta/${o.proveedor_codigo}`} className="underline-offset-2 hover:underline">{o.razon_social}</Link>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDate(o.fecha_op)}{o.titular ? ` · ${o.titular}` : ""}{o.origen === "app" ? " · armada en la app" : ""}
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  {app ? (
                    <StatusPill tone={PILL[estado].tone} icon={PILL[estado].icon}>{estado}</StatusPill>
                  ) : (
                    <StatusPill tone="amber" icon={Clock}>
                      {o.estado}{o.estado_clickup && o.estado_clickup !== o.estado ? ` · ClickUp: ${o.estado_clickup}` : ""}
                    </StatusPill>
                  )}
                  <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} className="font-semibold text-primary" />
                  {o.origen === "app" && <AnularOP numero={o.numero} />}
                </div>
              </div>
              <Table>
                <TableBody>
                  {o.facturas.map((f) => (
                    <TableRow key={f.id} className="align-top">
                      <TableCell className="px-4">
                        {f.tipo} {f.numero}
                        {app && f.decision && (
                          <div className={`whitespace-normal text-xs ${f.decision === "Observada" ? "text-red-700" : "text-emerald-800"}`}>
                            {f.decision} por {f.usuario}{f.motivo ? `: ${f.motivo}` : ""}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="px-4">{f.unidad}</TableCell>
                      <TableCell className="px-4 text-muted-foreground">vence {formatDate(f.vencimiento)}</TableCell>
                      <TableCell className="px-4 text-right"><Monto v={f.importe} /></TableCell>
                      {app && aprueba && (
                        <TableCell className="px-4 py-1 text-right">
                          {Number(f.importe) !== 0 && (
                            <DecidirLinea numero={o.numero} comprobanteId={f.id} factura={`${f.tipo} ${f.numero}`} decision={f.decision} />
                          )}
                        </TableCell>
                      )}
                    </TableRow>
                  ))}
                  {Number(o.otras) !== 0 && (
                    <TableRow className="text-muted-foreground">
                      <TableCell className="px-4" colSpan={3}>Otras unidades o a cuenta</TableCell>
                      <TableCell className="px-4 text-right"><Monto v={o.otras} /></TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
