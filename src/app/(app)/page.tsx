import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { listarPendientes, type Pendiente } from "@/lib/pendientes";
import { listarOPsApp } from "@/lib/op/queries";
import { pendientesOP } from "@/lib/op/estados";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { TableroDeuda } from "@/components/cuenta/TableroDeuda";
import { MoneyCell } from "@/components/shared/MoneyCell";

export const dynamic = "force-dynamic";

/** Los grupos con más de esto arrancan cerrados, para que la pantalla se lea de un vistazo. */
const ABIERTO_HASTA = 6;

// Inicio de Adriano (decisión 17/11): arriba lo vencido y lo que hay que hacer, abajo el tablero de deuda.
export default async function InicioPage() {
  const hoy = hoyArgentina();
  const [alertas, abiertos, ops] = await Promise.all([listarPendientes(), listarAbiertos(), listarOPsApp()]);
  // Primero lo de las OP de la app (se resuelve en la app), después las alertas de la base.
  const pendientes: Pendiente[] = [...pendientesOP(ops, hoy).map((p) => ({ ...p, origen: "op" as const })), ...alertas];
  const grupos = new Map<string, Pendiente[]>();
  for (const p of pendientes) grupos.set(p.tipo, [...(grupos.get(p.tipo) ?? []), p]);
  const tablero = resumirDeuda(abiertos, hoy);
  const conVencido = tablero.porProveedor.filter((p) => Number(p.vencido) > 0).length;

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <h1 className="text-2xl font-bold text-primary">Inicio</h1>

      {/* Aviso de lo vencido, como "Contratos por vencer" de alquileres */}
      {Number(tablero.vencido) > 0 && (
        <div className="rounded-md border border-l-[3px] border-neutral-200 border-l-red-600 bg-white px-[18px] py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-red-800">
            <TriangleAlert className="h-3.5 w-3.5" /> Hay deuda vencida
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_1fr]">
            <Celda k="Vencido" sub={`${conVencido} ${conVencido === 1 ? "proveedor" : "proveedores"}`}>
              <MoneyCell value={Number(tablero.vencido)} currency="ARS" decimals={0} className="text-xl font-semibold text-red-800" />
            </Celda>
            <Celda k="Vence esta semana" sub="en los próximos 7 días" borde>
              <MoneyCell value={Number(tablero.semana)} currency="ARS" decimals={0} className="text-xl font-semibold" />
            </Celda>
            <div className="flex items-center justify-start sm:justify-end sm:border-l sm:pl-4">
              <Link href="/cuenta" className="inline-flex h-8 items-center gap-1.5 whitespace-nowrap rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[#163828]">
                Ver a quién se le debe <ChevronRight className="h-4 w-4" />
              </Link>
            </div>
          </div>
        </div>
      )}

      <section className="space-y-3">
        <div className="flex items-baseline gap-3">
          <h2 className="text-lg font-semibold text-primary">Lo que hay que hacer</h2>
          <span className="text-xs text-muted-foreground">{pendientes.length} {pendientes.length === 1 ? "cosa" : "cosas"}</span>
        </div>
        {pendientes.length === 0 ? (
          <div className="rounded-lg border border-border/60 bg-white p-12 text-center">
            <p className="text-sm text-muted-foreground">Nada pendiente.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-lg border border-border/60 bg-white">
            {[...grupos].map(([tipo, lista]) => {
              const href = lista.find((p) => p.href)?.href;
              return (
                <details key={tipo} open={lista.length <= ABIERTO_HASTA} className="group border-b last:border-b-0">
                  <summary className="flex cursor-pointer list-none items-center gap-2 bg-[#fafaf7] px-4 py-2.5 text-sm font-semibold text-[#1B4332] hover:bg-[#f5f5f0]">
                    <ChevronRight className="h-4 w-4 transition-transform group-open:rotate-90" />
                    {tipo}
                    <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{lista.length}</span>
                    {href && <span className="ml-auto text-xs font-normal text-muted-foreground">se resuelve en <Link href={href} className="text-primary underline-offset-2 hover:underline">{href === "/aprobar" ? "Para aprobar" : href === "/pagos" ? "Para pagar" : "Órdenes de pago"}</Link></span>}
                  </summary>
                  <ul className="divide-y divide-[#f2f1ec]">
                    {lista.map((p, i) => (
                      <li key={i} className="grid grid-cols-[minmax(160px,240px)_minmax(0,1fr)] gap-4 px-4 py-2.5 pl-10 text-[13px]">
                        <span className="font-medium text-foreground">{p.proveedor ?? "—"}</span>
                        <span className="text-[#525252]">{p.detalle ?? ""}</span>
                      </li>
                    ))}
                  </ul>
                </details>
              );
            })}
          </div>
        )}
      </section>

      <TableroDeuda t={tablero} hoy={hoy} />
    </div>
  );
}

function Celda({ k, sub, borde, children }: { k: string; sub: string; borde?: boolean; children: React.ReactNode }) {
  return (
    <div className={borde ? "sm:border-l sm:pl-4" : ""}>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{k}</p>
      <div>{children}</div>
      <p className="text-[11px] text-neutral-500">{sub}</p>
    </div>
  );
}
