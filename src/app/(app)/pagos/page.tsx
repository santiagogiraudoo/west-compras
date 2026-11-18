import Link from "next/link";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { hoyArgentina, listarOPAbiertas } from "@/lib/cuenta/queries";
import { armarTextoCuenta } from "@/lib/proveedores/cuenta";
import { estadoAprobacion, medioSugerido, vencimientoOP } from "@/lib/op/pago";
import { PagarOP } from "./PagarOP";

export const dynamic = "force-dynamic";

/**
 * Pagos (Candela): OP de la app con todas sus líneas aprobadas, por vencimiento.
 * Las de ClickUp siguen pagándose allá hasta que se apaguen las listas Pagos y CC.
 */
export default async function PagosPage() {
  const [ops, session] = await Promise.all([listarOPAbiertas(), auth()]);
  const hoy = hoyArgentina();
  const paga = session?.user?.role !== "consulta";

  const deLaApp = ops.filter((o) => o.origen === "app");
  const aPagar = deLaApp
    .filter((o) => estadoAprobacion(o.facturas) === "Autorizada")
    .map((o) => ({ ...o, vence: vencimientoOP(o.facturas) }))
    .sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));
  const esperan = deLaApp.filter((o) => estadoAprobacion(o.facturas) === "A aprobar").length;
  const observadas = deLaApp.filter((o) => estadoAprobacion(o.facturas) === "Observada").length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-primary">Pagos</h1>
        <p className="text-sm text-muted-foreground">
          OP autorizadas, la que vence primero arriba.
          {(esperan > 0 || observadas > 0) && (
            <> En <Link href="/op" className="underline">Órdenes de pago</Link>: {esperan} esperan aprobación{observadas ? `, ${observadas} observada${observadas > 1 ? "s" : ""}` : ""}.</>
          )}
        </p>
      </div>

      {aPagar.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No hay OP autorizadas para pagar.</p>
      ) : (
        <section className="overflow-x-auto rounded-md border bg-card">
          <table className="w-full text-sm [&_td]:whitespace-nowrap">
            <thead className="text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-4 py-2">Vence</th>
                <th className="px-4 py-2">OP</th>
                <th className="px-4 py-2">Proveedor</th>
                <th className="px-4 py-2">Titular</th>
                <th className="px-4 py-2">Cuenta</th>
                <th className="px-4 py-2 text-right">Total</th>
                <th className="px-4 py-2" />
              </tr>
            </thead>
            <tbody>
              {aPagar.map((o) => {
                const cuenta = armarTextoCuenta({ cbu: o.cbu, alias: o.alias, banco: o.banco, titular: o.cuenta_titular });
                const vencida = o.vence != null && o.vence < hoy;
                return (
                  <tr key={o.numero} className="border-t">
                    <td className={`px-4 py-2 ${vencida ? "font-medium text-red-700" : ""}`}>{o.vence ? formatDate(o.vence) : "—"}</td>
                    <td className="px-4 py-2 font-medium text-primary">{o.numero}</td>
                    <td className="px-4 py-2">
                      <Link href={`/cuenta/${o.proveedor_codigo}`} className="hover:underline">{o.razon_social}</Link>
                    </td>
                    <td className="px-4 py-2">{o.titular ?? "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{cuenta ?? "sin cuenta"}</td>
                    <td className="px-4 py-2 text-right"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} /></td>
                    <td className="px-4 py-2 text-right">
                      {paga && (
                        <PagarOP numero={o.numero} proveedor={o.razon_social} total={o.total_imputado}
                          cuenta={cuenta} medio={medioSugerido(o.medio_pago_habitual)} hoy={hoy} />
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </section>
      )}
    </div>
  );
}
