import Link from "next/link";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Pagos</h1>
        <p className="text-sm text-muted-foreground">
          OP autorizadas, la que vence primero arriba.
          {(esperan > 0 || observadas > 0) && (
            <> En <Link href="/op" className="text-primary underline-offset-2 hover:underline">Órdenes de pago</Link>: {esperan} esperan aprobación{observadas ? `, ${observadas} observada${observadas > 1 ? "s" : ""}` : ""}.</>
          )}
        </p>
      </div>

      {aPagar.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay OP autorizadas para pagar.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Vence</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>OP</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Titular</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Cuenta</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Total</TableHead>
                <TableHead className="w-[50px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {aPagar.map((o) => {
                const cuenta = armarTextoCuenta({ cbu: o.cbu, alias: o.alias, banco: o.banco, titular: o.cuenta_titular });
                const vencida = o.vence != null && o.vence < hoy;
                return (
                  <TableRow key={o.numero}>
                    <TableCell className={vencida ? "font-medium text-red-700" : ""}>{o.vence ? formatDate(o.vence) : "—"}</TableCell>
                    <TableCell className="font-medium text-primary">{o.numero}</TableCell>
                    <TableCell>
                      <Link href={`/cuenta/${o.proveedor_codigo}`} className="underline-offset-2 hover:underline">{o.razon_social}</Link>
                    </TableCell>
                    <TableCell>{o.titular ?? "—"}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cuenta ?? "sin cuenta"}</TableCell>
                    <TableCell className="text-right"><MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} /></TableCell>
                    <TableCell className="text-right">
                      {paga && (
                        <PagarOP numero={o.numero} proveedor={o.razon_social} total={o.total_imputado}
                          cuenta={cuenta} medio={medioSugerido(o.medio_pago_habitual)} hoy={hoy} />
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
