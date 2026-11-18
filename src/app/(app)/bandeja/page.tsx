import Link from "next/link";
import { CircleAlert, Clock, TriangleAlert } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { listarBandeja } from "@/lib/facturas/queries";

export const dynamic = "force-dynamic";

/** Bandeja de facturas: solo las que no pasaron solas, con el motivo a la vista. */
export default async function BandejaPage() {
  const filas = await listarBandeja();

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Bandeja de facturas</h1>
        <p className="text-sm text-muted-foreground">
          Las que esperan aprobación o tienen algo que frena. Lo completo pasa solo.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">Nada en la bandeja.</p>
        </div>
      ) : (
        <div className="rounded-md border overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Fecha</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Comprobante</TableHead>
                <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Total</TableHead>
                <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Qué tiene</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filas.map((f) => (
                <TableRow key={f.id}>
                  <TableCell>{formatDate(f.fecha)}</TableCell>
                  <TableCell className="whitespace-normal">{f.proveedor}</TableCell>
                  <TableCell>
                    <Link href={`/bandeja/${f.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                      {f.tipo} {f.numero}
                    </Link>
                  </TableCell>
                  <TableCell className="text-right"><MoneyCell value={f.total} currency="ARS" decimals={2} /></TableCell>
                  <TableCell className="min-w-[240px] whitespace-normal">
                    <div className="flex flex-wrap gap-1">
                      {f.estado === "Pendiente" && <StatusPill tone="amber" icon={Clock}>Sin aprobar</StatusPill>}
                      {f.requisitos.faltan.map((m) => <StatusPill key={m} tone="red" icon={TriangleAlert}>{m}</StatusPill>)}
                      {f.requisitos.excepciones.map((m) => <StatusPill key={m} tone="amber" icon={CircleAlert}>{m}</StatusPill>)}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
}
