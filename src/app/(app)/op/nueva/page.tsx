import Link from "next/link";
import Decimal from "decimal.js";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { prisma } from "@/lib/prisma";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { ArmarOP } from "@/components/op/ArmarOP";

export const dynamic = "force-dynamic";

/**
 * Armado de OP (Adriano la arma eligiendo facturas aprobadas; no hay CC mensual).
 * Sin proveedor: a quién se le puede armar una. Con proveedor: sus facturas libres.
 */
export default async function NuevaOPPage({ searchParams }: { searchParams: Promise<{ proveedor?: string }> }) {
  const { proveedor: codigo } = await searchParams;
  const hoy = hoyArgentina();
  const abiertos = (await listarAbiertos(codigo)).filter((a) => Math.abs(Number(a.libre)) > 0.5);

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      {codigo ? <ConProveedor codigo={codigo} facturas={abiertos} hoy={hoy} /> : <ElegirProveedor abiertos={abiertos} />}
    </div>
  );
}

async function ConProveedor({ codigo, facturas, hoy }: { codigo: string; facturas: Awaited<ReturnType<typeof listarAbiertos>>; hoy: string }) {
  const p = await prisma.proveedor.findUnique({ where: { codigo } });
  if (!p) return <p className="text-sm">No encontré el proveedor {codigo}.</p>;
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
          faltan={faltantesProveedor(p)} facturas={facturas} hoy={hoy} />
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
        <h1 className="text-2xl font-bold text-primary">Nueva OP</h1>
        <p className="text-sm text-muted-foreground">Proveedores con facturas aprobadas que todavía no están en ninguna OP.</p>
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
