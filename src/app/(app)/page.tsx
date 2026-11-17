import { listarPendientes } from "@/lib/pendientes";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { TableroDeuda } from "@/components/cuenta/TableroDeuda";

export const dynamic = "force-dynamic";

// Inicio de Adriano (decisión 17/11): arriba lo que hay que hacer, abajo el tablero de deuda.
export default async function InicioPage() {
  const hoy = hoyArgentina();
  const [pendientes, abiertos] = await Promise.all([listarPendientes(), listarAbiertos()]);
  const porTipo = new Map<string, number>();
  for (const p of pendientes) porTipo.set(p.tipo, (porTipo.get(p.tipo) ?? 0) + 1);

  return (
    <div className="mx-auto max-w-5xl space-y-8">
      <section className="space-y-4">
        <h1 className="text-xl font-semibold text-primary">Lo que hay que hacer</h1>
        {pendientes.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada pendiente.</p>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {[...porTipo].map(([tipo, n]) => (
                <span key={tipo} className="rounded-full border px-3 py-1 text-xs">
                  {tipo} · <b>{n}</b>
                </span>
              ))}
            </div>
            <table className="w-full text-sm">
              <thead className="text-left text-xs text-muted-foreground">
                <tr><th className="py-2">Qué</th><th>Proveedor</th><th>Detalle</th></tr>
              </thead>
              <tbody>
                {pendientes.map((p, i) => (
                  <tr key={i} className="border-t">
                    <td className="py-2 pr-4">{p.tipo}</td>
                    <td className="pr-4">{p.proveedor ?? "—"}</td>
                    <td className="text-muted-foreground">{p.detalle ?? ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </>
        )}
      </section>
      <TableroDeuda t={resumirDeuda(abiertos, hoy)} hoy={hoy} />
    </div>
  );
}
