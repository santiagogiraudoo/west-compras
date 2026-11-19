import Link from "next/link";
import Decimal from "decimal.js";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { ArmarOP } from "@/components/op/ArmarOP";
import { PlanDePagos } from "@/components/op/PlanDePagos";
import { aReservar, planDePagos } from "@/lib/cuenta/plan";

export const dynamic = "force-dynamic";

/**
 * Armado de OP (Adriano la arma eligiendo facturas aprobadas; no hay CC mensual).
 * Sin proveedor: el plan de pagos (todas las OP que hay que armar ya, de un toque) y abajo el
 * resto. Con proveedor: sus facturas libres, con lo que vence ya tildado y las NC descontadas.
 */
export default async function NuevaOPPage({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  const { proveedor: codigo } = await searchParams;
  const hoy = hoyArgentina();
  const abiertos = (await listarAbiertos(codigo)).filter((a) => Math.abs(Number(a.libre)) > 0.5);

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      {codigo ? <ConProveedor codigo={codigo} facturas={abiertos} hoy={hoy} /> : <Plan abiertos={abiertos} hoy={hoy} />}
    </div>
  );
}

async function Plan({ abiertos, hoy }: { abiertos: Awaited<ReturnType<typeof listarAbiertos>>; hoy: string }) {
  const ops = planDePagos(abiertos, hoy);
  const proveedores = await prisma.proveedor.findMany({ where: { codigo: { in: [...new Set(ops.map((o) => o.proveedor))] } } });
  const faltan = Object.fromEntries(proveedores.map((p) => [p.codigo, faltantesProveedor(p)]));
  return (
    <>
      <TituloDePestana label="Plan de pagos" />
      <div>
        <h1 className="text-2xl font-bold text-primary">Plan de pagos</h1>
        <p className="text-sm text-muted-foreground">
          Lo vencido y lo que vence en los próximos 7 días, ya armado en OP: una por proveedor y titular, con las notas de crédito descontadas. Tildá y mandá a aprobar.
        </p>
      </div>
      <PlanDePagos ops={ops} faltan={faltan} hoy={hoy} />
      <ElegirProveedor abiertos={abiertos} />
    </>
  );
}

async function ConProveedor({ codigo, facturas, hoy }: { codigo: string; facturas: Awaited<ReturnType<typeof listarAbiertos>>; hoy: string }) {
  const p = await prisma.proveedor.findUnique({ where: { codigo } });
  if (!p) return <p className="text-sm">No encontré el proveedor {codigo}.</p>;
  // Viene tildado lo que vence (la OP del titular con más vencido), con las NC descontadas.
  const sugerida = planDePagos(facturas, hoy)[0];
  const inicial = sugerida ? aReservar(sugerida) : { ids: [], importes: {} };
  return (
    <>
      <TituloDePestana label={`Nueva OP · ${p.razon_social}`} />
      <div>
        <h1 className="text-2xl font-bold text-primary">Nueva OP · {p.razon_social}</h1>
        <p className="text-sm text-muted-foreground">Elegí las facturas aprobadas a pagar. Pueden ser de varias unidades, de un solo titular.</p>
      </div>
      {facturas.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No tiene facturas aprobadas libres para una OP.</p>
        </div>
      ) : (
        <ArmarOP proveedor={{ codigo: p.codigo, razon_social: p.razon_social, cuit: p.cuit, cbu: p.cbu, alias: p.alias, banco: p.banco, cuenta_titular: p.cuenta_titular }}
          faltan={faltantesProveedor(p)} facturas={facturas} hoy={hoy} inicial={inicial} />
      )}
    </>
  );
}

function ElegirProveedor({ abiertos }: { abiertos: Awaited<ReturnType<typeof listarAbiertos>> }) {
  const porProv = new Map<string, { nombre: string; libre: Decimal; n: number }>();
  for (const a of abiertos) {
    const p = porProv.get(a.proveedor_codigo) ?? { nombre: a.razon_social, libre: new Decimal(0), n: 0 };
    p.libre = p.libre.plus(a.libre);
    p.n += 1;
    porProv.set(a.proveedor_codigo, p);
  }
  const filas = [...porProv].filter(([, p]) => p.libre.greaterThan(0.5)).sort((a, b) => b[1].libre.comparedTo(a[1].libre));
  return (
    <>
      <div>
        <h2 className="text-lg font-semibold text-primary">Armar una OP a mano</h2>
        <p className="text-sm text-muted-foreground">Todos los proveedores con facturas aprobadas que todavía no están en ninguna OP, venzan cuando venzan.</p>
      </div>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Facturas</TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Libre para OP</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map(([codigo, p]) => (
              <TableRow key={codigo}>
                <TableCell>
                  <Link href={`/op/nueva?proveedor=${codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.nombre}</Link>
                </TableCell>
                <TableCell>{p.n}</TableCell>
                <TableCell className="text-right"><MoneyCell value={p.libre.toNumber()} currency="ARS" decimals={0} /></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </>
  );
}
