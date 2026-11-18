import Link from "next/link";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Monto } from "@/components/cuenta/DeudaPorProveedor";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { listarOPAbiertas } from "@/lib/cuenta/queries";
import { auth } from "@/lib/auth";
import { estadoAprobacion, type EstadoAprobacion } from "@/lib/op/pago";
import { AnularOP } from "./AnularOP";
import { DecidirLinea } from "./DecidirLinea";

export const dynamic = "force-dynamic";

const COLOR: Record<EstadoAprobacion, string> = {
  "A aprobar": "border-amber-200 bg-amber-50 text-amber-900",
  Observada: "border-red-200 bg-red-50 text-red-800",
  Autorizada: "border-emerald-200 bg-emerald-50 text-emerald-900",
};

/**
 * OP abiertas (Previstas) de West Desarrolladora con sus facturas. Las armadas en la app
 * se aprueban acá línea por línea (rol admin); autorizadas, pasan a Pagos.
 */
export default async function OPPage() {
  const [ops, session] = await Promise.all([listarOPAbiertas(), auth()]);
  const aprueba = session?.user?.role === "admin";
  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">Órdenes de pago abiertas</h1>
          <p className="text-sm text-muted-foreground">Previstas: reservadas con sus facturas, todavía sin pagar. Una línea observada frena toda la OP.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/op/nueva"><FilePlus className="h-4 w-4" /> Nueva OP</Link>
        </Button>
      </div>

      {ops.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No hay OP abiertas.</p>
      ) : (
        <div className="space-y-3">
          {ops.map((o) => {
            const app = o.origen === "app";
            const estado = estadoAprobacion(o.facturas);
            return (
            <div key={o.numero} className="rounded-md border bg-card">
              <div className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
                <div>
                  <span className="font-semibold text-primary">{o.numero}</span>
                  <span className="ml-2 text-sm">
                    <Link href={`/cuenta/${o.proveedor_codigo}`} className="underline-offset-2 hover:underline">{o.razon_social}</Link>
                  </span>
                  <span className="ml-2 text-xs text-muted-foreground">
                    {formatDate(o.fecha_op)}{o.titular ? ` · ${o.titular}` : ""}{o.origen === "app" ? " · armada en la app" : ""}
                  </span>
                </div>
                <div className="flex items-baseline gap-3">
                  {app ? (
                    <span className={`rounded-full border px-2 py-0.5 text-xs ${COLOR[estado]}`}>{estado}</span>
                  ) : (
                    <span className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">
                      {o.estado}{o.estado_clickup && o.estado_clickup !== o.estado ? ` · ClickUp: ${o.estado_clickup}` : ""}
                    </span>
                  )}
                  <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} className="text-primary" />
                  {o.origen === "app" && <AnularOP numero={o.numero} />}
                </div>
              </div>
              <table className="w-full text-sm">
                <tbody>
                  {o.facturas.map((f) => (
                    <tr key={f.id} className="border-t first:border-t-0 align-top">
                      <td className="px-4 py-1.5">
                        {f.tipo} {f.numero}
                        {app && f.decision && (
                          <div className={`text-xs ${f.decision === "Observada" ? "text-red-700" : "text-emerald-800"}`}>
                            {f.decision} por {f.usuario}{f.motivo ? `: ${f.motivo}` : ""}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-1.5">{f.unidad}</td>
                      <td className="px-4 py-1.5 text-muted-foreground">vence {formatDate(f.vencimiento)}</td>
                      <td className="px-4 py-1.5 text-right"><Monto v={f.importe} /></td>
                      {app && aprueba && (
                        <td className="px-4 py-1 text-right">
                          {Number(f.importe) !== 0 && (
                            <DecidirLinea numero={o.numero} comprobanteId={f.id} factura={`${f.tipo} ${f.numero}`} decision={f.decision} />
                          )}
                        </td>
                      )}
                    </tr>
                  ))}
                  {Number(o.otras) !== 0 && (
                    <tr className="border-t text-muted-foreground">
                      <td className="px-4 py-1.5" colSpan={3}>Otras unidades o a cuenta</td>
                      <td className="px-4 py-1.5 text-right"><Monto v={o.otras} /></td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
