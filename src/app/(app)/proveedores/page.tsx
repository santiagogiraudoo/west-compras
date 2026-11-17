import Link from "next/link";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { prisma } from "@/lib/prisma";
import { faltantesProveedor } from "@/lib/facturas/requisitos";

export const dynamic = "force-dynamic";

/**
 * Proveedores con su alta: lo que falta para poder pagarles (decisión 17/11:
 * CUIT, CBU, condición de IVA, WhatsApp, rubro y condiciones de pago).
 * Primero los incompletos; tocar uno abre su ficha para completarla.
 */
export default async function ProveedoresPage() {
  const proveedores = await prisma.proveedor.findMany({ where: { activo: true }, orderBy: { razon_social: "asc" } });
  const filas = proveedores
    .map((p) => ({ ...p, faltan: faltantesProveedor(p) }))
    .sort((a, b) => b.faltan.length - a.faltan.length);
  const completos = filas.filter((f) => f.faltan.length === 0).length;

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-xl font-semibold text-primary">Proveedores</h1>
          <p className="text-sm text-muted-foreground">{completos} de {filas.length} con el alta completa para poder pagarles.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/proveedores/nuevo"><Plus className="h-4 w-4" /> Nuevo proveedor</Link>
        </Button>
      </div>
      <table className="w-full rounded-md border bg-card text-sm">
        <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
          <tr><th className="px-3 py-2">Código</th><th className="px-3 py-2">Proveedor</th><th className="px-3 py-2">CUIT</th><th className="px-3 py-2">Le falta</th></tr>
        </thead>
        <tbody>
          {filas.map((p) => (
            <tr key={p.codigo} className="border-t">
              <td className="px-3 py-2 text-muted-foreground">{p.codigo}</td>
              <td className="px-3 py-2"><Link href={`/proveedores/${p.codigo}`} className="text-primary underline-offset-2 hover:underline">{p.razon_social}</Link></td>
              <td className="px-3 py-2">{p.cuit ?? "—"}</td>
              <td className="px-3 py-2">
                {p.faltan.length === 0 ? <span className="text-xs text-emerald-700">Completo</span> : (
                  <div className="flex flex-wrap gap-1">
                    {p.faltan.map((f) => <span key={f} className="rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs text-amber-900">{f}</span>)}
                  </div>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
