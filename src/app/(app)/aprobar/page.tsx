import { auth } from "@/lib/auth";
import { aResolver, decide, type EstadoOP } from "@/lib/op/estados";
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
          Cada renglón lo aprueba quien aprueba su unidad. Un renglón observado o bloqueado frena toda la OP.
        </p>
      </div>
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
