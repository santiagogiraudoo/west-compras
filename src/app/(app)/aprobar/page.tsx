import { auth } from "@/lib/auth";
import { decide, puedeDecidir, type EstadoOP } from "@/lib/op/estados";
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
    .sort((a, b) => Number(b.lineas.some((l) => puedeDecidir(l, usuario))) - Number(a.lineas.some((l) => puedeDecidir(l, usuario))));
  const deOtros = ops.filter((o) => !teToca.includes(o) && !frenadas.includes(o));

  const seccion = (titulo: string, ayuda: string, lista: OPConLineas[]) => lista.length > 0 && (
    <section className="space-y-3">
      <div>
        <h2 className="font-medium">{titulo} <span className="text-muted-foreground">· {lista.length}</span></h2>
        <p className="text-xs text-muted-foreground">{ayuda}</p>
      </div>
      {lista.map((o) => (
        <TarjetaOP key={o.numero} op={o} usuario={usuario} deuda={deuda[o.proveedor_codigo] ?? null} ultimas={ultimas[o.proveedor_codigo] ?? []} />
      ))}
    </section>
  );

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-primary">Para aprobar</h1>
        <p className="text-sm text-muted-foreground">
          Cada renglón lo aprueba quien aprueba su unidad. Un renglón observado o bloqueado frena toda la OP.
        </p>
      </div>
      {ops.length === 0 && <p className="rounded-md border bg-card p-6 text-sm text-muted-foreground">No hay OP para aprobar.</p>}
      {seccion("Te toca", "Renglones de tus unidades sin decidir. Si todo está en verde, se aprueba de un toque.", teToca)}
      {seccion("Observadas y bloqueadas", "Frenadas hasta que las resuelva quien las observó o Adriano, o se descarten.", frenadas)}
      {seccion("Esperando a otros", "Tus renglones ya están decididos o son de otras unidades.", deOtros)}
    </div>
  );
}
