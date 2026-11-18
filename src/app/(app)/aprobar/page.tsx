import Decimal from "decimal.js";
import { Clock, MessageSquareWarning, PenLine, Users, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { auth } from "@/lib/auth";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { aResolver, decide, diasEntre, type EstadoOP } from "@/lib/op/estados";
import { contextoProveedores, listarOPsApp, type OPConLineas } from "@/lib/op/queries";
import { TarjetaOP } from "@/components/op/TarjetaOP";

export const dynamic = "force-dynamic";

/**
 * Para aprobar: una tarjeta por OP. Arriba lo que le toca a quien entra (renglones de sus
 * unidades sin decidir); después las observadas y bloqueadas (le llegan a Adriano); al
 * final lo que espera a otros, como referencia.
 */
export default async function AprobarPage() {
  const session = await auth();
  const usuario = { id: (session?.user as { id: number } | undefined)?.id ?? 0, role: session?.user?.role ?? "consulta" };
  const ops = await listarOPsApp(["A aprobar", "Observada", "Bloqueada"] as EstadoOP[]);
  const { deuda, ultimas } = await contextoProveedores([...new Set(ops.map((o) => o.proveedor_codigo))]);

  const teToca = ops.filter((o) => o.estado === "A aprobar" && o.lineas.some((l) => decide(l, usuario) && !l.decision));
  // Las frenadas que puede resolver quien entra van primero dentro de su sección.
  const frenadas = ops.filter((o) => o.estado !== "A aprobar")
    .sort((a, b) => Number(b.lineas.some((l) => decide(l, usuario) || aResolver(l, usuario)))
      - Number(a.lineas.some((l) => decide(l, usuario) || aResolver(l, usuario))));
  const deOtros = ops.filter((o) => !teToca.includes(o) && !frenadas.includes(o));

  // El resumen: cuánto te toca firmar y desde cuándo espera lo más viejo.
  const hoy = hoyArgentina();
  const aFirmar = teToca.flatMap((o) => o.lineas.filter((l) => decide(l, usuario) && !l.decision))
    .reduce((t, l) => t.plus(l.importe), new Decimal(0));
  const masVieja = Math.max(0, ...teToca.map((o) => (o.enviada_en ? diasEntre(o.enviada_en, hoy) : 0)));
  const resumen: { label: string; v: React.ReactNode; nota: string; icon: LucideIcon; tono: string }[] = [
    { label: "Te toca firmar", v: <MoneyCell value={aFirmar.toNumber()} currency="ARS" decimals={0} />,
      nota: `${teToca.length} OP`, icon: PenLine, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Espera hace", v: teToca.length === 0 ? "—" : masVieja === 0 ? "hoy" : `${masVieja} ${masVieja === 1 ? "día" : "días"}`,
      nota: teToca.length === 0 ? "no tenés nada para firmar" : "lo más viejo tuyo", icon: Clock, tono: masVieja >= 3 ? "bg-red-50 text-red-600" : "bg-amber-50 text-amber-600" },
    { label: "Frenadas", v: String(frenadas.length), nota: "observadas o bloqueadas", icon: MessageSquareWarning,
      tono: frenadas.length ? "bg-orange-50 text-orange-600" : "bg-emerald-50 text-emerald-600" },
    { label: "Esperando a otros", v: String(deOtros.length), nota: "nada tuyo para decidir", icon: Users, tono: "bg-emerald-50 text-emerald-600" },
  ];

  const seccion = (titulo: string, ayuda: string, lista: OPConLineas[]) => lista.length > 0 && (
    <section className="space-y-3">
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
        <h2 className="flex items-center gap-2 text-base font-semibold text-primary">
          {titulo}
          <span className="rounded-full bg-primary/10 px-2 py-px text-[11px] font-semibold text-primary">{lista.length}</span>
        </h2>
        <span className="text-xs text-muted-foreground">{ayuda}</span>
      </div>
      {lista.map((o) => (
        <TarjetaOP key={o.numero} op={o} usuario={usuario} deuda={deuda[o.proveedor_codigo] ?? null} ultimas={ultimas[o.proveedor_codigo] ?? []} />
      ))}
    </section>
  );

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Para aprobar</h1>
        <p className="text-sm text-muted-foreground">
          Cada factura la aprueba quien aprueba su unidad. Podés observar una sola y aprobar el resto; una observada frena toda la OP.
        </p>
      </div>
      {ops.length > 0 && (
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
          {resumen.map((c) => (
            <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
              <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tono}`}><c.icon className="h-5 w-5" /></div>
              <div className="min-w-0">
                <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
                <p className="truncate text-lg font-semibold text-primary">{c.v}</p>
                <p className="text-xs text-muted-foreground">{c.nota}</p>
              </div>
            </div>
          ))}
        </div>
      )}
      {ops.length === 0 && (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">No hay OP para aprobar.</p>
        </div>
      )}
      {seccion("Te toca", "Renglones de tus unidades sin decidir. Si todo está en verde, se aprueba de un toque.", teToca)}
      {seccion("Observadas y bloqueadas", "Frenadas hasta que se resuelvan, se quite la observación o se descarten.", frenadas)}
      {seccion("Esperando a otros", "Tus renglones ya están decididos o son de otras unidades.", deOtros)}
    </div>
  );
}
