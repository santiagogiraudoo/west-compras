import Link from "next/link";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import type { DeudaProveedor } from "@/lib/cuenta/calculos";

/** Deuda por proveedor: la usa el tablero de Inicio y la lista de cuentas corrientes. */
export function DeudaPorProveedor({ filas, hoy }: { filas: DeudaProveedor[]; hoy: string }) {
  if (filas.length === 0) {
    return <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No se le debe nada a nadie.</p>;
  }
  return (
    <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
      <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
        <tr>
          <th className="px-3 py-2">Proveedor</th>
          <th className="px-3 py-2 text-right">Deuda</th>
          <th className="px-3 py-2 text-right">Vencido</th>
          <th className="px-3 py-2 text-right">Esta semana</th>
          <th className="px-3 py-2 text-right">En OP prevista</th>
          <th className="px-3 py-2">Próximo vencimiento</th>
        </tr>
      </thead>
      <tbody>
        {filas.map((p) => (
          <tr key={p.codigo} className="border-t hover:bg-muted/30">
            <td className="px-3 py-2">
              <Link href={`/cuenta/${p.codigo}`} className="text-primary underline-offset-2 hover:underline">{p.razon_social}</Link>
            </td>
            <td className="px-3 py-2 text-right"><Monto v={p.deuda} /></td>
            <td className="px-3 py-2 text-right"><Monto v={p.vencido} className="text-red-700" /></td>
            <td className="px-3 py-2 text-right"><Monto v={p.semana} /></td>
            <td className="px-3 py-2 text-right"><Monto v={p.en_op} className="text-muted-foreground" /></td>
            <td className={`px-3 py-2 ${p.proximo_vencimiento && p.proximo_vencimiento < hoy ? "text-red-700" : ""}`}>
              {formatDate(p.proximo_vencimiento)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Un monto en cero no se muestra: la columna se lee más rápido. */
export function Monto({ v, className }: { v: string; className?: string }) {
  const n = Number(v);
  if (n === 0) return <span className="text-muted-foreground">—</span>;
  return <MoneyCell value={n} currency="ARS" decimals={2} className={className} />;
}
