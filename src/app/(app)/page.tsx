import Link from "next/link";
import { listarPendientes, type Pendiente } from "@/lib/pendientes";
import { listarOPsApp } from "@/lib/op/queries";
import { pendientesOP } from "@/lib/op/estados";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { TableroDeuda } from "@/components/cuenta/TableroDeuda";
import { StatusPill } from "@/components/shared/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";

export const dynamic = "force-dynamic";

// Inicio de Adriano (decisión 17/11): arriba lo que hay que hacer, abajo el tablero de deuda.
export default async function InicioPage() {
  const hoy = hoyArgentina();
  const [alertas, abiertos, ops] = await Promise.all([listarPendientes(), listarAbiertos(), listarOPsApp()]);
  // Primero lo de las OP de la app (se resuelve en la app), después las alertas de la base.
  const pendientes: Pendiente[] = [...pendientesOP(ops, hoy).map((p) => ({ ...p, origen: "op" as const })), ...alertas];
  const porTipo = new Map<string, number>();
  for (const p of pendientes) porTipo.set(p.tipo, (porTipo.get(p.tipo) ?? 0) + 1);

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <section className="space-y-4">
        <h1 className="text-2xl font-bold text-primary">Lo que hay que hacer</h1>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendiente.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {[...porTipo].map(([tipo, n]) => (
                <StatusPill key={tipo} tone="neutral" size="md">
                  {tipo} · {n}
                </StatusPill>
              ))}
            </div>
            <div className="rounded-md border overflow-hidden">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Qué</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
                    <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Detalle</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {pendientes.map((p, i) => (
                    <TableRow key={i}>
                      <TableCell className="whitespace-normal">
                        {p.href ? <Link href={p.href} className="font-medium text-primary underline-offset-2 hover:underline">{p.tipo}</Link> : p.tipo}
                      </TableCell>
                      <TableCell className="whitespace-normal">{p.proveedor ?? "—"}</TableCell>
                      <TableCell className="min-w-[280px] whitespace-normal text-muted-foreground">{p.detalle ?? ""}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </>
        )}
      </section>
      <TableroDeuda t={resumirDeuda(abiertos, hoy)} hoy={hoy} />
    </div>
  );
}
