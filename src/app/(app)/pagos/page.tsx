import Link from "next/link";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Copiar } from "@/components/shared/Copiar";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { listarOPsApp } from "@/lib/op/queries";
import { medioSugerido, vencimientoOP } from "@/lib/op/pago";
import { PagarOP } from "./PagarOP";

export const dynamic = "force-dynamic";

/**
 * Para pagar (Candela): OP autorizadas, la que vence primero arriba, con la cuenta para
 * copiar. Al registrar el pago se cargan retenciones y comprobante, y el neto se calcula.
 * Las de ClickUp siguen pagándose allá hasta que se apaguen las listas Pagos y CC.
 */
export default async function PagosPage() {
  const [autorizadas, session] = await Promise.all([listarOPsApp(["Autorizada"]), auth()]);
  const hoy = hoyArgentina();
  const paga = session?.user?.role !== "consulta";
  const ops = autorizadas
    .map((o) => ({ ...o, vence: vencimientoOP(o.lineas) }))
    .sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-primary">Para pagar</h1>
        <p className="text-sm text-muted-foreground">
          OP autorizadas, la que vence primero arriba. Las que esperan aprobación están en <Link href="/aprobar" className="underline">Para aprobar</Link>.
        </p>
      </div>

      {ops.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No hay OP autorizadas para pagar.</p>
      ) : (
        <div className="space-y-3">
          {ops.map((o) => {
            const vencida = o.vence != null && o.vence < hoy;
            return (
              <article key={o.numero} className="rounded-md border bg-card text-sm">
                <header className="flex flex-wrap items-baseline justify-between gap-2 border-b px-4 py-3">
                  <div className="flex flex-wrap items-baseline gap-x-3">
                    <span className={vencida ? "font-medium text-red-700" : "text-muted-foreground"}>
                      vence {o.vence ? formatDate(o.vence) : "—"}{vencida ? " (vencida)" : ""}
                    </span>
                    <Link href={`/cuenta/${o.proveedor_codigo}`} className="font-semibold text-primary hover:underline">{o.razon_social}</Link>
                    <span className="text-xs text-muted-foreground">{o.numero} · paga {o.titular ?? "—"} · {o.lineas.length} factura{o.lineas.length > 1 ? "s" : ""}</span>
                  </div>
                  <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} className="text-base font-semibold" />
                </header>
                <div className="flex flex-wrap items-end justify-between gap-3 px-4 py-3">
                  <dl className="grid gap-x-6 gap-y-1 sm:grid-cols-2">
                    <Dato k="CBU / CVU"><Copiar etiqueta="CBU" valor={o.cbu} /></Dato>
                    <Dato k="Alias"><Copiar etiqueta="Alias" valor={o.alias} /></Dato>
                    <Dato k="Titular de la cuenta"><Copiar etiqueta="Titular" valor={o.cuenta_titular} /></Dato>
                    <Dato k="CUIT"><Copiar etiqueta="CUIT" valor={o.cuit} /></Dato>
                    <Dato k="Banco">{o.banco ?? "—"}</Dato>
                  </dl>
                  {paga && (
                    <PagarOP numero={o.numero} proveedor={o.razon_social} total={o.total_imputado}
                      medio={medioSugerido(o.medio_pago_habitual)} hoy={hoy} />
                  )}
                </div>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <dt className="w-36 text-xs text-muted-foreground">{k}</dt>
      <dd>{children}</dd>
    </div>
  );
}
