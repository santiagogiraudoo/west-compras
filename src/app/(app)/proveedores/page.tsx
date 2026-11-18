import Link from "next/link";
import { CheckCircle, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { StatusPill } from "@/components/shared/StatusPill";
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
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between">
        <div>
          <h1 className="text-2xl font-bold text-primary">Proveedores</h1>
          <p className="text-sm text-muted-foreground">{completos} de {filas.length} con el alta completa para poder pagarles.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/proveedores/nuevo"><Plus className="h-4 w-4" /> Nuevo proveedor</Link>
        </Button>
      </div>
      <div className="rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Código</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>CUIT</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Le falta</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {filas.map((p) => (
              <TableRow key={p.codigo}>
                <TableCell className="text-muted-foreground">{p.codigo}</TableCell>
                <TableCell>
                  <Link href={`/proveedores/${p.codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.razon_social}</Link>
                </TableCell>
                <TableCell>{p.cuit ?? "—"}</TableCell>
                <TableCell className="min-w-[260px] whitespace-normal">
                  {p.faltan.length === 0 ? (
                    <StatusPill tone="success" icon={CheckCircle}>Completo</StatusPill>
                  ) : (
                    <div className="flex flex-wrap gap-1">
                      {p.faltan.map((f) => <StatusPill key={f} tone="amber">{f}</StatusPill>)}
                    </div>
                  )}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
