import Link from "next/link";
import Decimal from "decimal.js";
import { ArrowLeft } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { prisma } from "@/lib/prisma";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { ArmarOP } from "./ArmarOP";

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
    <div className="mx-auto max-w-6xl space-y-4">
      <Link href="/op" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Órdenes de pago
      </Link>
      {codigo ? <ConProveedor codigo={codigo} facturas={abiertos} hoy={hoy} /> : <ElegirProveedor abiertos={abiertos} />}
    </div>
  );
}

async function ConProveedor({ codigo, facturas, hoy }: { codigo: string; facturas: Awaited<ReturnType<typeof listarAbiertos>>; hoy: string }) {
  const p = await prisma.proveedor.findUnique({ where: { codigo } });
  if (!p) return <p className="text-sm">No encontré el proveedor {codigo}.</p>;
  return (
    <>
      <div>
        <h1 className="text-xl font-semibold text-primary">Nueva OP · {p.razon_social}</h1>
        <p className="text-sm text-muted-foreground">Elegí las facturas aprobadas a pagar. Pueden ser de varias unidades, de un solo titular.</p>
      </div>
      {facturas.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No tiene facturas aprobadas libres para una OP.</p>
      ) : (
        <ArmarOP proveedor={{ codigo: p.codigo, razon_social: p.razon_social, cuit: p.cuit, cbu_alias: p.cbu_alias }}
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
        <h1 className="text-xl font-semibold text-primary">Nueva OP</h1>
        <p className="text-sm text-muted-foreground">Proveedores con facturas aprobadas que todavía no están en ninguna OP.</p>
      </div>
      <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">Facturas</th><th className="px-3 py-2 text-right">Libre para OP</th></tr>
        </thead>
        <tbody>
          {filas.map(([codigo, p]) => (
            <tr key={codigo} className="border-t hover:bg-muted/30">
              <td className="px-3 py-2">
                <Link href={`/op/nueva?proveedor=${codigo}`} className="text-primary underline-offset-2 hover:underline">{p.nombre}</Link>
              </td>
              <td className="px-3 py-2">{p.n}</td>
              <td className="px-3 py-2 text-right"><MoneyCell value={p.libre.toNumber()} currency="ARS" decimals={2} /></td>
            </tr>
          ))}
        </tbody>
      </table>
    </>
  );
}
