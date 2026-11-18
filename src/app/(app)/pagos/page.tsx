import Link from "next/link";
import { Banknote } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Copiar } from "@/components/shared/Copiar";
import { FichaCard, FichaLabel } from "@/components/properties/FichaCard";
import { formatDate } from "@/lib/utils";
import { auth } from "@/lib/auth";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { listarOPsApp } from "@/lib/op/queries";
import { medioSugerido, vencimientoOP } from "@/lib/op/pago";
import { PagarOP } from "./PagarOP";

export const dynamic = "force-dynamic";

/**
 * Para pagar (Candela): OP autorizadas, la que vence primero arriba, con la cuenta para
 * copiar. Al registrar el pago se sube el comprobante (se lee solo), se cargan retenciones
 * y el neto se calcula. Las de ClickUp siguen pagándose allá hasta que se apaguen las listas.
 */
export default async function PagosPage() {
  const [autorizadas, session] = await Promise.all([listarOPsApp(["Autorizada"]), auth()]);
  const hoy = hoyArgentina();
  const paga = session?.user?.role !== "consulta";
  const ops = autorizadas
    .map((o) => ({ ...o, vence: vencimientoOP(o.lineas) }))
    .sort((a, b) => (a.vence ?? "9999").localeCompare(b.vence ?? "9999"));

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Para pagar</h1>
        <p className="text-sm text-muted-foreground">
          OP autorizadas, la que vence primero arriba. Las que esperan aprobación están en <Link href="/aprobar" className="text-primary underline-offset-2 hover:underline">Para aprobar</Link>.
        </p>
      </div>

      {ops.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay OP autorizadas para pagar.</p>
        </div>
      ) : (
        <div className="space-y-4">
          {ops.map((o) => {
            const vencida = o.vence != null && o.vence < hoy;
            const unidades = [...new Set(o.lineas.map((l) => l.unidad_nombre || l.unidad))].join(", ");
            return (
              <FichaCard key={o.numero} icon={Banknote}
                title={<Link href={`/op/${o.numero}`} className="underline-offset-2 hover:underline">{o.numero}</Link>}
                barClassName={vencida ? "bg-[#b91c1c]" : undefined}
                actions={<span className="text-xs text-white/85">{vencida ? "Vencida · " : ""}vence {o.vence ? formatDate(o.vence) : "—"}</span>}>
                <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-2 border-b border-[#f2f1ec] px-5 py-4">
                  <div className="min-w-0">
                    <Link href={`/cuenta/${o.proveedor_codigo}`} className="text-[15px] font-semibold text-foreground underline-offset-2 hover:text-primary hover:underline">
                      {o.razon_social}
                    </Link>
                    <p className="mt-0.5 text-[12.5px] text-[#737373]">
                      {unidades} · factura a {o.titular ?? "—"} · {o.lineas.length} {o.lineas.length === 1 ? "factura" : "facturas"}
                    </p>
                  </div>
                  <div className="text-right">
                    <FichaLabel>Total</FichaLabel>
                    <MoneyCell value={Number(o.total_imputado)} currency="ARS" decimals={2} className="block text-[20px] leading-7 font-semibold text-primary" />
                  </div>
                </div>
                <div className="flex flex-wrap items-end justify-between gap-4 px-5 py-4">
                  <dl className="grid gap-x-8 gap-y-2 sm:grid-cols-2 lg:grid-cols-3">
                    <Dato k="CBU / CVU"><Copiar etiqueta="CBU" valor={o.cbu} /></Dato>
                    <Dato k="Alias"><Copiar etiqueta="Alias" valor={o.alias} /></Dato>
                    <Dato k="Titular de la cuenta"><Copiar etiqueta="Titular" valor={o.cuenta_titular} /></Dato>
                    <Dato k="CUIT"><Copiar etiqueta="CUIT" valor={o.cuit} /></Dato>
                    <Dato k="Banco">{o.banco ?? "—"}</Dato>
                  </dl>
                  {paga && (
                    <PagarOP numero={o.numero} proveedor={o.razon_social} total={o.total_imputado}
                      medio={medioSugerido(o.medio_pago_habitual)} hoy={hoy} cbu={o.cbu} alias={o.alias} />
                  )}
                </div>
              </FichaCard>
            );
          })}
        </div>
      )}
    </div>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{k}</dt>
      <dd className="text-[13.5px]">{children}</dd>
    </div>
  );
}
