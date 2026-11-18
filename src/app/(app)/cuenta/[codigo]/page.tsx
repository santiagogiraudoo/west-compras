import Link from "next/link";
import { notFound } from "next/navigation";
import Decimal from "decimal.js";
import { CalendarClock, CheckCircle, FilePlus, FileText, PiggyBank, Receipt, TriangleAlert, Wallet } from "lucide-react";
import { StatusPill } from "@/components/shared/StatusPill";
import { diasEntre } from "@/lib/op/estados";
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
/** Ícono de cada tarjeta, en el orden de `resumen`: saldo, facturas abiertas, a favor, en OP. */
const TARJETAS = [
  { icon: Wallet, bg: "bg-[#B8960C]/10", color: "text-[#B8960C]" },
  { icon: Receipt, bg: "bg-amber-50", color: "text-amber-600" },
  { icon: PiggyBank, bg: "bg-emerald-50", color: "text-emerald-600" },
  { icon: FileText, bg: "bg-[#1B4332]/10", color: "text-[#1B4332]" },
];
const GOLD = { color: "#B8960C" };

/**
 * Cuenta corriente de un proveedor (solo West Desarrolladora): facturas abiertas con su
 * vencimiento y el extracto debe/haber. El saldo sale del extracto; lo que se debe, de las
 * facturas abiertas; el saldo a favor es la diferencia (notas de crédito y pagos a cuenta
 * todavía sin aplicar a una factura).
 */
/** Movimientos del extracto que se ven de entrada; el resto, con "Ver todo". */
const ULTIMOS = 30;

export default async function CuentaProveedorPage({ params, searchParams }: {
  params: Promise<{ codigo: string }>; searchParams: Promise<{ todo?: string }>;
}) {
  const { codigo } = await params;
  const { todo } = await searchParams;
  const hoy = hoyArgentina();
  const [proveedor, abiertos, movimientos] = await Promise.all([
    prisma.proveedor.findUnique({ where: { codigo }, select: { codigo: true, razon_social: true, cuit: true, cbu: true, alias: true, banco: true, cuenta_titular: true, condicion_pago: true, medio_pago_habitual: true } }),
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

  // El extracto largo se corta en los últimos movimientos, con el saldo que traían.
  const corta = !todo && extracto.lineas.length > ULTIMOS;
  const lineas = corta ? extracto.lineas.slice(-ULTIMOS) : extracto.lineas;
  const saldoAnterior = corta ? extracto.lineas[extracto.lineas.length - ULTIMOS - 1].saldo : null;

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
        <div className="min-w-0">
          <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.015em] text-primary">{proveedor.razon_social}</h1>
          <p className="mt-1 text-[13.5px] text-[#525252]">
            <Link href={`/proveedores/${proveedor.codigo}`} className="font-medium text-foreground underline-offset-2 hover:text-primary hover:underline">
              {proveedor.codigo}
            </Link>
            {proveedor.cuit ? ` · CUIT ${proveedor.cuit}` : ""}{cuentaTexto ? ` · ${cuentaTexto}` : ""}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            {proveedor.condicion_pago?.trim() ? (
              <StatusPill tone="success" icon={CalendarClock}>Paga a: {proveedor.condicion_pago}</StatusPill>
            ) : (
              <Link href={`/proveedores/${proveedor.codigo}`}>
                <StatusPill tone="amber" icon={TriangleAlert}>Sin condición de pago: sus facturas vencen el día que se emiten · cargala</StatusPill>
              </Link>
            )}
            {proveedor.medio_pago_habitual && <StatusPill tone="neutral">{proveedor.medio_pago_habitual}</StatusPill>}
          </div>
        </div>
        <div className="flex gap-2">
          <DescargarExtracto proveedor={{ codigo: proveedor.codigo, razon_social: proveedor.razon_social, cuit: proveedor.cuit }} hoy={hoy} extracto={extracto} abiertos={abiertos} resumen={resumen} />
          {libre.greaterThan(0.5) && (
            <Button size="sm" asChild>
              <Link href={`/op/nueva?proveedor=${proveedor.codigo}`}><FilePlus className="h-4 w-4" /> Armar OP</Link>
            </Button>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {resumen.map((r, i) => {
          const t = TARJETAS[i];
          return (
            <div key={r.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${t.bg}`}>
                <t.icon className={`h-5 w-5 ${t.color}`} />
              </div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{r.label}</p>
                <MoneyCell value={Number(r.v)} currency="ARS" decimals={0} className="block truncate text-lg font-semibold text-primary" />
              </div>
            </div>
          );
        })}
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
                  <TableHead className={TH} style={GOLD}>Estado</TableHead>
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
                    <TableCell><EstadoFactura a={a} hoy={hoy} /></TableCell>
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
              {saldoAnterior != null && (
                <TableRow className="text-muted-foreground hover:bg-transparent">
                  <TableCell colSpan={5}>
                    Saldo de los {extracto.lineas.length - ULTIMOS} movimientos anteriores ·{" "}
                    <Link href={`/cuenta/${proveedor.codigo}?todo=1`} className="font-medium text-primary underline-offset-2 hover:underline">ver todo el extracto</Link>
                  </TableCell>
                  <TableCell className="text-right"><MoneyCell value={Number(saldoAnterior)} currency="ARS" decimals={0} /></TableCell>
                </TableRow>
              )}
              {lineas.map((l, i) => (
                <TableRow key={i}>
                  <TableCell>{formatDate(l.fecha)}</TableCell>
                  <TableCell>{l.concepto}</TableCell>
                  <TableCell>{l.unidad ?? ""}</TableCell>
                  <TableCell className="text-right"><Monto v={l.debe} className="text-[#1B4332]" /></TableCell>
                  <TableCell className="text-right"><Monto v={l.haber} /></TableCell>
                  <TableCell className="text-right"><MoneyCell value={Number(l.saldo)} currency="ARS" decimals={0} /></TableCell>
                </TableRow>
              ))}
              <TableRow className="bg-muted/30 font-semibold hover:bg-muted/30">
                <TableCell colSpan={3}>Totales</TableCell>
                <TableCell className="text-right"><Monto v={extracto.debe} /></TableCell>
                <TableCell className="text-right"><Monto v={extracto.haber} /></TableCell>
                <TableCell className="text-right"><MoneyCell value={Number(extracto.saldo)} currency="ARS" decimals={0} /></TableCell>
              </TableRow>
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

/** En qué anda cada factura abierta: lo más urgente manda. */
function EstadoFactura({ a, hoy }: { a: { vencimiento: string | null; fecha: string; libre: string; en_op: string; deuda: string }; hoy: string }) {
  if (Number(a.deuda) <= 0) return <StatusPill tone="neutral">A favor</StatusPill>;
  const enOp = Number(a.en_op) > 0.5 && Number(a.libre) <= 0.5;
  const dias = a.vencimiento ? diasEntre(hoy, a.vencimiento) : null;
  if (enOp) return <StatusPill tone="success" icon={CheckCircle}>{dias != null && dias < 0 ? `En OP · venció hace ${-dias} d` : "En OP"}</StatusPill>;
  if (dias == null) return <StatusPill tone="neutral">Sin vencimiento</StatusPill>;
  if (dias < 0) return <StatusPill tone="red" icon={TriangleAlert}>{a.vencimiento! <= a.fecha ? "Contado, sin OP" : `Venció hace ${-dias} ${dias === -1 ? "día" : "días"}`}</StatusPill>;
  if (dias <= 7) return <StatusPill tone="amber" icon={CalendarClock}>{dias === 0 ? "Vence hoy" : `Vence en ${dias} ${dias === 1 ? "día" : "días"}`}</StatusPill>;
  return <StatusPill tone="neutral">Vence en {dias} días</StatusPill>;
}
