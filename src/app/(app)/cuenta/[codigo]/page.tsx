import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { ArrowLeft, FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Monto } from "@/components/cuenta/DeudaPorProveedor";
import { DescargarExtracto } from "@/components/cuenta/DescargarExtracto";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { armarExtracto } from "@/lib/cuenta/calculos";
import { hoyArgentina, listarAbiertos, listarMovimientos } from "@/lib/cuenta/queries";

export const dynamic = "force-dynamic";

/**
 * Cuenta corriente de un proveedor (solo West Desarrolladora): facturas abiertas con su
 * vencimiento y el extracto debe/haber. El saldo sale del extracto; lo que se debe, de las
 * facturas abiertas; el saldo a favor es la diferencia (notas de crédito y pagos a cuenta
 * todavía sin aplicar a una factura).
 */
export default async function CuentaProveedorPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const hoy = hoyArgentina();
  const [proveedor, abiertos, movimientos] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo }, select: { codigo: true, razon_social: true, cuit: true, cbu_alias: true } }),
    listarAbiertos(codigo),
    listarMovimientos(codigo),
  ]);
  if (!proveedor) notFound();

  const extracto = armarExtracto(movimientos);
  const porPagar = abiertos.filter((a) => Number(a.deuda) > 0);
  const deuda = porPagar.reduce((t, a) => t.plus(a.deuda), new Decimal(0));
  const enOp = abiertos.reduce((t, a) => t.plus(a.en_op), new Decimal(0));
  const aFavor = Decimal.max(0, deuda.minus(extracto.saldo));
  const libre = abiertos.reduce((t, a) => t.plus(a.libre), new Decimal(0));

  const resumen = [
    { label: "Saldo", v: extracto.saldo },
    { label: "Facturas abiertas", v: deuda.toFixed(2) },
    { label: "Saldo a favor", v: aFavor.toFixed(2) },
    { label: "En OP prevista", v: enOp.toFixed(2) },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <Link href="/cuenta" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Cuentas corrientes
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold text-primary">{proveedor.razon_social}</h1>
          <p className="text-sm text-muted-foreground">
            {proveedor.codigo}{proveedor.cuit ? ` · CUIT ${proveedor.cuit}` : ""}{proveedor.cbu_alias ? ` · CBU ${proveedor.cbu_alias}` : ""}
          </p>
        </div>
        <div className="flex gap-2">
          <DescargarExtracto proveedor={proveedor} hoy={hoy} extracto={extracto} abiertos={abiertos} resumen={resumen} />
          {libre.greaterThan(0.5) && (
            <Button size="sm" asChild>
              <Link href={`/op/nueva?proveedor=${proveedor.codigo}`}><FilePlus className="h-4 w-4" /> Armar OP</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {resumen.map((r) => (
          <div key={r.label} className="rounded-md border bg-card p-4">
            <div className="text-xs text-muted-foreground">{r.label}</div>
            <MoneyCell value={Number(r.v)} currency="ARS" decimals={2} className="mt-1 block text-lg text-primary" />
          </div>
        ))}
      </div>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-primary">Facturas abiertas</h2>
        {abiertos.length === 0 ? (
          <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No tiene facturas abiertas.</p>
        ) : (
          <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th className="px-3 py-2">Comprobante</th><th className="px-3 py-2">Unidad</th><th className="px-3 py-2">Titular</th>
                <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Vence</th>
                <th className="px-3 py-2 text-right">Total</th><th className="px-3 py-2 text-right">Falta pagar</th>
                <th className="px-3 py-2">En OP</th>
              </tr>
            </thead>
            <tbody>
              {abiertos.map((a) => (
                <tr key={a.id} className="border-t">
                  <td className="px-3 py-2">
                    <Link href={`/bandeja/${a.id}`} className="text-primary underline-offset-2 hover:underline">{a.tipo} {a.numero}</Link>
                  </td>
                  <td className="px-3 py-2">{a.unidad_codigo}</td>
                  <td className="px-3 py-2">{a.facturado_a ?? "—"}</td>
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(a.fecha)}</td>
                  <td className={`px-3 py-2 whitespace-nowrap ${a.vencimiento && a.vencimiento < hoy && Number(a.deuda) > 0 ? "text-red-700" : ""}`}>
                    {formatDate(a.vencimiento)}
                  </td>
                  <td className="px-3 py-2 text-right"><Monto v={a.total} /></td>
                  <td className="px-3 py-2 text-right"><Monto v={a.deuda} /></td>
                  <td className="px-3 py-2 text-xs">{a.ops ?? ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-semibold text-primary">Extracto</h2>
        <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th><th className="px-3 py-2">Concepto</th><th className="px-3 py-2">Unidad</th>
              <th className="px-3 py-2 text-right">Debe</th><th className="px-3 py-2 text-right">Haber</th><th className="px-3 py-2 text-right">Saldo</th>
            </tr>
          </thead>
          <tbody>
            {extracto.lineas.map((l, i) => (
              <tr key={i} className="border-t">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(l.fecha)}</td>
                <td className="px-3 py-2">{l.concepto}</td>
                <td className="px-3 py-2">{l.unidad ?? ""}</td>
                <td className="px-3 py-2 text-right"><Monto v={l.debe} /></td>
                <td className="px-3 py-2 text-right"><Monto v={l.haber} /></td>
                <td className="px-3 py-2 text-right"><MoneyCell value={Number(l.saldo)} currency="ARS" decimals={2} /></td>
              </tr>
            ))}
            <tr className="border-t bg-muted/30 font-medium">
              <td className="px-3 py-2" colSpan={3}>Totales</td>
              <td className="px-3 py-2 text-right"><Monto v={extracto.debe} /></td>
              <td className="px-3 py-2 text-right"><Monto v={extracto.haber} /></td>
              <td className="px-3 py-2 text-right"><MoneyCell value={Number(extracto.saldo)} currency="ARS" decimals={2} /></td>
            </tr>
          </tbody>
        </table>
      </section>
    </div>
  );
}
