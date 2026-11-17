import Link from "next/link";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { listarBandeja } from "@/lib/facturas/queries";

export const dynamic = "force-dynamic";

/** Bandeja de facturas: solo las que no pasaron solas, con el motivo a la vista. */
export default async function BandejaPage() {
  const filas = await listarBandeja();

  return (
    <div className="mx-auto max-w-6xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-primary">Bandeja de facturas</h1>
        <p className="text-sm text-muted-foreground">
          Las que esperan aprobación o tienen algo que frena. Lo completo pasa solo.
        </p>
      </div>

      {filas.length === 0 ? (
        <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">Nada en la bandeja.</p>
      ) : (
        <table className="w-full overflow-hidden rounded-md border bg-card text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-3 py-2">Fecha</th>
              <th className="px-3 py-2">Proveedor</th>
              <th className="px-3 py-2">Comprobante</th>
              <th className="px-3 py-2 text-right">Total</th>
              <th className="px-3 py-2">Qué tiene</th>
            </tr>
          </thead>
          <tbody>
            {filas.map((f) => (
              <tr key={f.id} className="border-t hover:bg-muted/30">
                <td className="px-3 py-2 whitespace-nowrap">{formatDate(f.fecha)}</td>
                <td className="px-3 py-2">{f.proveedor}</td>
                <td className="px-3 py-2">
                  <Link href={`/bandeja/${f.id}`} className="font-medium text-primary underline-offset-2 hover:underline">
                    {f.tipo} {f.numero}
                  </Link>
                </td>
                <td className="px-3 py-2 text-right"><MoneyCell value={f.total} currency="ARS" decimals={2} /></td>
                <td className="px-3 py-2">
                  <div className="flex flex-wrap gap-1">
                    {f.estado === "Pendiente" && <Chip tono="dorado">Sin aprobar</Chip>}
                    {f.requisitos.faltan.map((m) => <Chip key={m} tono="rojo">{m}</Chip>)}
                    {f.requisitos.excepciones.map((m) => <Chip key={m} tono="dorado">{m}</Chip>)}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

function Chip({ tono, children }: { tono: "rojo" | "dorado"; children: React.ReactNode }) {
  const cls = tono === "rojo" ? "bg-red-50 text-red-800 border-red-200" : "bg-amber-50 text-amber-900 border-amber-200";
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${cls}`}>{children}</span>;
}
