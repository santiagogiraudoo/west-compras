import Link from "next/link";
import { ChevronRight, TriangleAlert } from "lucide-react";
import { listarPendientes, type Pendiente } from "@/lib/pendientes";
import { listarOPsApp } from "@/lib/op/queries";
import { pendientesOP } from "@/lib/op/estados";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import Decimal from "decimal.js";
import { porVencerSinOP, resumirDeuda } from "@/lib/cuenta/calculos";
import { formatDate } from "@/lib/utils";
import { TableroDeuda } from "@/components/cuenta/TableroDeuda";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Bienvenida, Flujo, ICONOS, type Paso } from "@/components/inicio/Bienvenida";
import { auth } from "@/lib/auth";
import { listarBandeja } from "@/lib/facturas/queries";
import { vencimientoOP } from "@/lib/op/pago";

const pesos = (v: Decimal.Value) => `$${new Decimal(v).toNumber().toLocaleString("es-AR", { maximumFractionDigits: 0 })}`;

export const dynamic = "force-dynamic";

/** Los grupos con más de esto arrancan cerrados, para que la pantalla se lea de un vistazo. */
const ABIERTO_HASTA = 6;

// Inicio de Adriano (decisión 17/11): arriba lo vencido y lo que hay que hacer, abajo el tablero de deuda.
export default async function InicioPage() {
  const hoy = hoyArgentina();
  const [alertas, abiertos, ops, bandeja, session] = await Promise.all([listarPendientes(), listarAbiertos(), listarOPsApp(), listarBandeja(), auth()]);
  // Primero lo que vence sin OP (para pagar en término), después lo de las OP de la app
  // (se resuelve en la app) y al final las alertas de la base.
  const porVencer: Pendiente[] = porVencerSinOP(abiertos, hoy).map((v) => ({
    origen: "op", tipo: "Vence pronto y no está en ninguna OP", proveedor: v.razon_social, href: `/op/nueva?proveedor=${v.proveedor_codigo}`,
    detalle: `${v.facturas} ${v.facturas === 1 ? "factura" : "facturas"} por ${pesos(v.libre)} · ${v.vence < hoy ? "venció" : "vence"} ${formatDate(v.vence)}`,
  }));
  const pendientes: Pendiente[] = [...porVencer, ...pendientesOP(ops, hoy).map((p) => ({ ...p, origen: "op" as const })), ...alertas];
  const grupos = new Map<string, Pendiente[]>();
  for (const p of pendientes) grupos.set(p.tipo, [...(grupos.get(p.tipo) ?? []), p]);
  const tablero = resumirDeuda(abiertos, hoy);
  const conVencido = tablero.porProveedor.filter((p) => Number(p.vencido) > 0).length;
  // Lo vencido que vence el mismo día que se emite (contado o proveedor sin condición de pago).
  const vencidoDelDia = abiertos.filter((a) => a.vencimiento && a.vencimiento < hoy && a.vencimiento <= a.fecha && Number(a.deuda) > 0.5)
    .reduce((t, a) => t.plus(a.deuda), new Decimal(0));

  // El flujo de compras en cuatro pasos, de la bandeja al pago.
  const de = (...e: string[]) => ops.filter((o) => e.includes(o.estado));
  const totalDe = (l: typeof ops) => l.reduce((t, o) => t.plus(o.total_imputado), new Decimal(0)).toFixed(2);
  const libres = abiertos.filter((a) => Number(a.libre) > 0.5);
  const aAprobar = de("A aprobar", "Observada", "Bloqueada");
  const frenadas = de("Observada", "Bloqueada").length;
  const autorizadas = de("Autorizada");
  const primera = autorizadas.map((o) => vencimientoOP(o.lineas)).filter(Boolean).sort()[0];
  const pasos: Paso[] = [
    { href: "/bandeja", label: "En la bandeja", n: bandeja.length, monto: bandeja.reduce((t, b) => t.plus(b.total), new Decimal(0)).toFixed(2),
      nota: "por aprobar o completar", icon: ICONOS.Inbox, tono: "bg-[#f5f5f0] text-[#737373]" },
    { href: "/op/nueva", label: "Aprobadas sin OP", n: libres.length, monto: libres.reduce((t, a) => t.plus(a.libre), new Decimal(0)).toFixed(2),
      nota: "listas para una OP", icon: ICONOS.FilePlus, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { href: "/aprobar", label: "OP para aprobar", n: aAprobar.length, monto: totalDe(aAprobar),
      nota: frenadas ? `${frenadas} frenada${frenadas > 1 ? "s" : ""}` : "esperan firma", icon: ICONOS.ClipboardCheck,
      tono: frenadas ? "bg-orange-50 text-orange-600" : "bg-amber-50 text-amber-600" },
    { href: "/pagos", label: "OP para pagar", n: autorizadas.length, monto: totalDe(autorizadas),
      nota: primera ? `la primera vence ${formatDate(primera)}` : "nada autorizado", icon: ICONOS.Banknote, tono: "bg-emerald-50 text-emerald-600" },
  ];

  // Una frase con lo más importante del día.
  const partes: string[] = [];
  if (Number(tablero.vencido) > 0) partes.push(`hay ${pesos(tablero.vencido)} vencidos`);
  if (porVencer.length) partes.push(`${porVencer.length} ${porVencer.length === 1 ? "proveedor tiene" : "proveedores tienen"} facturas por vencer sin OP`);
  if (aAprobar.length) partes.push(`${aAprobar.length} OP ${aAprobar.length === 1 ? "espera" : "esperan"} aprobación`);
  if (autorizadas.length) partes.push(`${autorizadas.length} OP ${autorizadas.length === 1 ? "está lista" : "están listas"} para pagar`);
  const frase = partes.length ? `Hoy ${partes.slice(0, -1).join(", ")}${partes.length > 1 ? " y " : ""}${partes[partes.length - 1]}.` : "Todo al día: no hay nada vencido ni esperando. ¡Bien ahí!";
  const nombre = (session?.user?.name ?? "").split(" ")[0] || "equipo";
  const hora = Number(new Intl.DateTimeFormat("en-US", { hour: "numeric", hourCycle: "h23", timeZone: "America/Argentina/Mendoza" }).format(new Date()));

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <Bienvenida nombre={nombre} hoy={hoy} hora={hora} frase={frase} accesos={[
        { href: "/op/nueva", label: "Armar OP", n: porVencer.length, icon: ICONOS.FilePlus },
        { href: "/aprobar", label: "Para aprobar", n: aAprobar.length, icon: ICONOS.ClipboardCheck },
        { href: "/pagos", label: "Para pagar", n: autorizadas.length, icon: ICONOS.Banknote },
      ]} />

      <Flujo pasos={pasos} />

      {/* Aviso de lo vencido, como "Contratos por vencer" de alquileres */}
      {Number(tablero.vencido) > 0 && (
        <div className="rounded-md border border-l-[3px] border-neutral-200 border-l-red-600 bg-white px-[18px] py-3">
          <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-red-800">
            <TriangleAlert className="h-3.5 w-3.5" /> Hay deuda vencida
          </p>
          <div className="mt-2 grid grid-cols-1 gap-3 sm:grid-cols-[1fr_1.4fr_1fr]">
            <Celda k="Vencido" sub={`${conVencido} ${conVencido === 1 ? "proveedor" : "proveedores"}${vencidoDelDia.gt(0) ? ` · ${pesos(vencidoDelDia)} de contado o sin condición de pago` : ""}`}>
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
                    <span className={`h-2 w-2 shrink-0 rounded-full ${lista[0].origen === "op" ? "bg-[#B8960C]" : lista[0].origen === "alerta" ? "bg-[#dc2626]" : "bg-[#a3a3a3]"}`} />
                    {tipo}
                    <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{lista.length}</span>
                    {href && (href.startsWith("/op/nueva")
                      ? <span className="ml-auto text-xs font-normal text-muted-foreground">tocá el proveedor para armarle la OP</span>
                      : <span className="ml-auto text-xs font-normal text-muted-foreground">se resuelve en <Link href={href} className="text-primary underline-offset-2 hover:underline">{href === "/aprobar" ? "Para aprobar" : href === "/pagos" ? "Para pagar" : "Órdenes de pago"}</Link></span>)}
                  </summary>
                  <ul className="divide-y divide-[#f2f1ec]">
                    {lista.map((p, i) => (
                      <li key={i} className="grid grid-cols-[minmax(160px,240px)_minmax(0,1fr)] gap-4 px-4 py-2.5 pl-10 text-[13px]">
                        {p.href?.startsWith("/op/nueva")
                          ? <Link href={p.href} className="font-medium text-primary underline-offset-2 hover:underline">{p.proveedor}</Link>
                          : <span className="font-medium text-foreground">{p.proveedor ?? "—"}</span>}
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
