import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";
import { FilaAprobador } from "./FilaAprobador";

export const dynamic = "force-dynamic";

/**
 * Configuración: quién aprueba cada unidad de West Desarrolladora (app.aprobadores).
 * Por defecto Adriano; West Club, Santiago Giraudo mientras dure la obra. Los topes se
 * guardan en dólar blue pero todavía no se usan: los define Santiago.
 */
export default async function ConfiguracionPage() {
  const [session, unidades, aprobadores, usuarios] = await Promise.all([
    auth(),
    prisma.unidad.findMany({ where: { marca: MARCA, activa: true }, orderBy: { codigo: "asc" } }),
    prisma.aprobador.findMany(),
    // Aprueba un admin u operador activo: uno de consulta no puede decidir nada.
    prisma.user.findMany({ where: { active: true, role: { in: ["admin", "operador"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
  ]);
  const edita = session?.user?.role === "admin";
  const por = new Map(aprobadores.map((a) => [a.unidad_codigo, a]));

  return (
    <div className="mx-auto max-w-5xl space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-primary">Configuración · Aprobadores</h1>
        <p className="text-sm text-muted-foreground">
          Cada renglón de una OP lo aprueba quien aprueba su unidad. Los topes (en dólar blue) se pueden cargar, pero
          todavía no se usan: hasta que estén definidos, todo renglón pide aprobación.
          {!edita && " Solo un administrador puede cambiarlos."}
        </p>
      </div>
      <section className="overflow-x-auto rounded-md border bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Unidad</th><th className="px-2">Aprueba</th>
              <th className="px-2">Tope por compra (USD)</th><th className="px-2">Tope por mes (USD)</th><th className="px-4" />
            </tr>
          </thead>
          <tbody>
            {unidades.map((u) => {
              const a = por.get(u.codigo);
              return (
                <FilaAprobador key={u.codigo} unidad={u.codigo} nombre={u.nombre} usuarioId={a?.usuario_id ?? null}
                  topeCompra={a?.tope_compra_usd?.toString() ?? null} topeMes={a?.tope_mes_usd?.toString() ?? null}
                  usuarios={usuarios} edita={edita} />
              );
            })}
          </tbody>
        </table>
      </section>
    </div>
  );
}
