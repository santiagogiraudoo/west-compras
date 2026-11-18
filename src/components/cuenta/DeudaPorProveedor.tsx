import Link from "next/link";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import type { DeudaProveedor } from "@/lib/cuenta/calculos";

/** Deuda por proveedor: la usa el tablero de Inicio y la lista de cuentas corrientes. */
export function DeudaPorProveedor({ filas, hoy }: { filas: DeudaProveedor[]; hoy: string }) {
  if (filas.length === 0) {
    return (
      <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
        <p className="text-sm text-muted-foreground">No se le debe nada a nadie.</p>
      </div>
    );
  }
  return (
    <div className="rounded-md border overflow-hidden">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Proveedor</TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Deuda</TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Vencido</TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Esta semana</TableHead>
            <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>En OP prevista</TableHead>
            <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Próximo vencimiento</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {filas.map((p) => (
            <TableRow key={p.codigo}>
              <TableCell className="min-w-[200px] whitespace-normal">
                <Link href={`/cuenta/${p.codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.razon_social}</Link>
              </TableCell>
              <TableCell className="text-right"><Monto v={p.deuda} /></TableCell>
              <TableCell className="text-right"><Monto v={p.vencido} className="text-red-700" /></TableCell>
              <TableCell className="text-right"><Monto v={p.semana} /></TableCell>
              <TableCell className="text-right"><Monto v={p.en_op} className="text-muted-foreground" /></TableCell>
              <TableCell className={p.proximo_vencimiento && p.proximo_vencimiento < hoy ? "text-red-700" : ""}>
                {formatDate(p.proximo_vencimiento)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

/** Un monto en cero no se muestra: la columna se lee más rápido. */
export function Monto({ v, className }: { v: string; className?: string }) {
  const n = Number(v);
  if (n === 0) return <span className="text-muted-foreground">—</span>;
  return <MoneyCell value={n} currency="ARS" decimals={0} className={className} />;
}
