import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Monto } from "@/components/cuenta/DeudaPorProveedor";
import { DescargarExtracto } from "@/components/cuenta/DescargarExtracto";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { prisma } from "@/lib/prisma";
import { formatDate } from "@/lib/utils";
import { armarExtracto } from "@/lib/cuenta/calculos";
import { armarTextoCuenta } from "@/lib/proveedores/cuenta";
import { hoyArgentina, listarAbiertos, listarMovimientos } from "@/lib/cuenta/queries";

export const dynamic = "force-dynamic";

const TH = "text-xs font-semibold uppercase tracking-wide";
const GOLD = { color: "#B8960C" };

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
    prisma.proveedor.findUnique({ where: { codigo }, select: { codigo: true, razon_social: true, cuit: true, cbu: true, alias: true, banco: true, cuenta_titular: true } }),
    listarAbiertos(codigo),
    listarMovimientos(codigo),
  ]);
  if (!proveedor) notFound();

  const extracto = armarExtracto(movimientos);
  const cuentaTexto = armarTextoCuenta({ cbu: proveedor.cbu, alias: proveedor.alias, banco: proveedor.banco, titular: proveedor.cuenta_titular });
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
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <TituloDePestana label={proveedor.razon_social} />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">{proveedor.razon_social}</h1>
          <p className="text-sm text-muted-foreground">
            {proveedor.codigo}{proveedor.cuit ? ` · CUIT ${proveedor.cuit}` : ""}{cuentaTexto ? ` · ${cuentaTexto}` : ""}
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

      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {resumen.map((r) => (
          <div key={r.label} className="border border-border/60 bg-[#FFFEFC] rounded-lg p-4">
            <p className="text-xs text-muted-foreground font-medium">{r.label}</p>
            <MoneyCell value={Number(r.v)} currency="ARS" decimals={2} className="block text-lg font-semibold text-primary truncate" />
          </div>
        ))}
      </div>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-primary">Facturas abiertas</h2>
        {abiertos.length === 0 ? (
          <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
            <p className="text-sm text-muted-foreground">No tiene facturas abiertas.</p>
          </div>
        ) : (
          <div className="rounded-md border overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className={TH} style={GOLD}>Comprobante</TableHead>
                  <TableHead className={TH} style={GOLD}>Unidad</TableHead>
                  <TableHead className={TH} style={GOLD}>Titular</TableHead>
                  <TableHead className={TH} style={GOLD}>Fecha</TableHead>
                  <TableHead className={TH} style={GOLD}>Vence</TableHead>
                  <TableHead className={`text-right ${TH}`} style={GOLD}>Total</TableHead>
                  <TableHead className={`text-right ${TH}`} style={GOLD}>Falta pagar</TableHead>
                  <TableHead className={TH} style={GOLD}>En OP</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {abiertos.map((a) => (
                  <TableRow key={a.id}>
                    <TableCell>
                      <Link href={`/bandeja/${a.id}`} className="font-medium text-primary underline-offset-2 hover:underline">{a.tipo} {a.numero}</Link>
                    </TableCell>
                    <TableCell>{a.unidad_codigo}</TableCell>
                    <TableCell className="min-w-[160px] whitespace-normal">{a.facturado_a ?? "—"}</TableCell>
                    <TableCell>{formatDate(a.fecha)}</TableCell>
                    <TableCell className={a.vencimiento && a.vencimiento < hoy && Number(a.deuda) > 0 ? "text-red-700" : ""}>
                      {formatDate(a.vencimiento)}
                    </TableCell>
                    <TableCell className="text-right"><Monto v={a.total} /></TableCell>
                    <TableCell className="text-right"><Monto v={a.deuda} /></TableCell>
                    <TableCell className="text-xs">{a.ops ?? ""}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </section>

      <section className="space-y-3">
        <h2 className="text-lg font-semibold text-primary">Extracto</h2>
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH} style={GOLD}>Fecha</TableHead>
                <TableHead className={TH} style={GOLD}>Concepto</TableHead>
                <TableHead className={TH} style={GOLD}>Unidad</TableHead>
                <TableHead className={`text-right ${TH}`} style={GOLD}>Debe</TableHead>
                <TableHead className={`text-right ${TH}`} style={GOLD}>Haber</TableHead>
                <TableHead className={`text-right ${TH}`} style={GOLD}>Saldo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {extracto.lineas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDate(l.fecha)}</TableCell>
                  <TableCell>{l.concepto}</TableCell>
                  <TableCell>{l.unidad ?? ""}</TableCell>
                  <TableCell className="text-right"><Monto v={l.debe} /></TableCell>
                  <TableCell className="text-right"><Monto v={l.haber} /></TableCell>
                  <TableCell className="text-right"><MoneyCell value={Number(l.saldo)} currency="ARS" decimals={2} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                <TableCell colSpan={3}>Totales</TableCell>
                <TableCell className="text-right"><Monto v={extracto.debe} /></TableCell>
                <TableCell className="text-right"><Monto v={extracto.haber} /></TableCell>
                <TableCell className="text-right"><MoneyCell value={Number(extracto.saldo)} currency="ARS" decimals={2} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}
