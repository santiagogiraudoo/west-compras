import Link from "next/link";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Monto } from "@/components/cuenta/DeudaPorProveedor";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { EstadoOPBadge } from "@/components/op/EstadoOP";
import { AccionOP } from "@/components/op/AccionOP";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { listarOPAbiertas } from "@/lib/cuenta/queries";
import { listarOPsApp } from "@/lib/op/queries";
import { SE_DESCARTA } from "@/lib/op/estados";
import { vencimientoOP } from "@/lib/op/pago";

export const dynamic = "force-dynamic";

/**
 * Órdenes de pago: las armadas en la app con su estado (En armado → A aprobar →
 * Autorizada → Pagada) y, abajo, las Previstas que siguen en ClickUp.
 */
export default async function OPPage() {
  const [ops, deClickUp, session] = await Promise.all([listarOPsApp(), listarOPAbiertas(), auth()]);
  const edita = session?.user?.role !== "consulta";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">Órdenes de pago</h1>
          <p className="text-sm text-muted-foreground">
            Se arman eligiendo facturas en la cuenta corriente, se mandan a aprobar y, autorizadas, pasan a <Link href="/pagos" className="underline">Para pagar</Link>.
          </p>
        </div>
        <Button size="sm" asChild>
          <Link href="/op/nueva"><FilePlus className="h-4 w-4" /> Nueva OP</Link>
        </Button>
      </div>

      {ops.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No hay OP abiertas armadas en la app.</p>
      ) : (
        <section className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm [&_td]:whitespace-nowrap">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">OP</th><th className="px-2">Proveedor</th><th className="px-2">Facturas</th>
                <th className="px-2">Vence</th><th className="px-2">Estado</th><th className="px-2 text-right">Total</th><th className="px-4" />
              </tr>
            </thead>
            <tbody>
              {ops.map((o) => {
                const vence = vencimientoOP(o.lineas);
                return (
                  <tr key={o.numero} className="border-t">
                    <td className="px-4 py-2 font-medium text-primary">{o.numero}</td>
                    <td className="px-2 py-2"><Link href={`/cuenta/${o.proveedor_codigo}`} className="hover:underline">{o.razon_social}</Link></td>
                    <td className="px-2 py-2">{o.lineas.length}</td>
                    <td className="px-2 py-2">{vence ? formatDate(vence) : "—"}</td>
                    <td className="px-2 py-2"><EstadoOPBadge estado={o.estado} /></td>
                    <td className="px-2 py-2 text-right"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} /></td>
                    <td className="px-4 py-2">
                      {edita && (
                        <div className="flex justify-end gap-1">
                          {o.estado === "En armado" && <AccionOP numero={o.numero} accion="enviar" />}
                          {["A aprobar", "Observada", "Bloqueada"].includes(o.estado) && (
                            <Button size="sm" variant="outline" asChild><Link href="/aprobar">Ver tarjeta</Link></Button>
                          )}
                          {SE_DESCARTA.includes(o.estado) && <AccionOP numero={o.numero} accion="descartar" />}
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}

      {deClickUp.length > 0 && (
        <section className="space-y-2">
          <h2 className="font-medium">Previstas en ClickUp</h2>
          <p className="text-xs text-muted-foreground">Se aprueban y pagan allá hasta que se apaguen las listas Pagos y CC.</p>
          <div className="rounded-md border bg-card">
            <table className="w-full text-sm">
              <tbody>
                {deClickUp.map((o) => (
                  <tr key={o.numero} className="border-t first:border-t-0">
                    <td className="px-4 py-2 font-medium">{o.numero}</td>
                    <td className="px-2 py-2">{o.razon_social}</td>
                    <td className="px-2 py-2 text-muted-foreground">{formatDate(o.fecha_op)}{o.estado_clickup ? ` · ClickUp: ${o.estado_clickup}` : ""}</td>
                    <td className="px-4 py-2 text-right"><Monto v={o.total_imputado} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
