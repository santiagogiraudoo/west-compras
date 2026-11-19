import { DollarSign, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { MARCA } from "@/lib/marca";
import { dolarBlue } from "@/lib/dolar";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { FilaAprobador } from "./FilaAprobador";

export const dynamic = "force-dynamic";

const TH = "text-xs font-semibold uppercase tracking-wide";
const GOLD = { color: "#B8960C" };
const pesos = (v: string) => `$${Number(v).toLocaleString("es-AR")}`;

/**
 * Configuración: quién aprueba cada unidad de West Desarrolladora (app.aprobadores) y su
 * tope en dólar blue. Por defecto Adriano; West Club, Santiago Giraudo mientras dure la
 * obra. Los montos de los topes los define Santiago.
 */
export default async function ConfiguracionPage() {
  const [session, unidades, aprobadores, usuarios, blue] = await Promise.all([
    auth(),
    prisma.unidad.findMany({ where: { marca: MARCA, activa: true }, orderBy: { codigo: "asc" } }),
    prisma.aprobador.findMany(),
    // Aprueba un admin u operador activo: uno de consulta no puede decidir nada.
    prisma.user.findMany({ where: { active: true, role: { in: ["admin", "operador"] } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    dolarBlue(),
  ]);
  const edita = session?.user?.role === "admin";
  const por = new Map(aprobadores.map((a) => [a.unidad_codigo, a]));

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Configuración</h1>
        <p className="text-sm text-muted-foreground">Quién aprueba cada unidad y hasta cuánto.</p>
      </div>

      {/* El dólar con el que se miden los topes */}
      {blue ? (
        <div className="flex flex-wrap items-center gap-x-8 gap-y-2 rounded-md border border-l-[3px] border-border/60 border-l-[#B8960C] bg-white px-[18px] py-3">
          <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#92400e]">
            <DollarSign className="h-3.5 w-3.5" /> Dólar blue de hoy
          </span>
          <Dato k="Compra" v={pesos(blue.compra)} />
          <Dato k="Venta" v={pesos(blue.venta)} />
          <Dato k="Promedio (el que usan los topes)" v={pesos(blue.promedio)} fuerte />
          <span className="ml-auto text-[11px] text-muted-foreground">dolarapi.com · {blue.fecha.split("-").reverse().join("/")}</span>
        </div>
      ) : (
        <p role="alert" className="flex items-center gap-2 rounded-md border border-amber-300 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          <TriangleAlert className="h-4 w-4" /> No se pudo leer el dólar blue: mientras tanto, todo renglón pide firma.
        </p>
      )}

      <section className="space-y-2">
        <div>
          <h2 className="text-base font-semibold text-primary">Aprobadores</h2>
          <p className="text-xs text-muted-foreground">
            Cada renglón de una OP lo aprueba quien aprueba su unidad. Con tope cargado, el renglón que cruza (remito, PDF,
            precio) y queda dentro del tope se aprueba solo al mandar la OP a aprobar; sin tope, pide firma. El tope por
            compra suma lo del mismo proveedor y unidad de los últimos 7 días, para que no se parta una compra.
            {!edita && " Solo un administrador puede cambiarlos."}
          </p>
        </div>
        <div className="overflow-hidden rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className={TH} style={GOLD}>Unidad</TableHead>
                <TableHead className={TH} style={GOLD}>Aprueba</TableHead>
                <TableHead className={TH} style={GOLD}>Tope por compra (USD)</TableHead>
                <TableHead className={TH} style={GOLD}>Tope por mes (USD)</TableHead>
                <TableHead className="w-[120px]" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {unidades.map((u) => {
                const a = por.get(u.codigo);
                return (
                  <FilaAprobador key={u.codigo} unidad={u.codigo} nombre={u.nombre} usuarioId={a?.usuario_id ?? null}
                    topeCompra={a?.tope_compra_usd?.toString() ?? null} topeMes={a?.tope_mes_usd?.toString() ?? null}
                    usuarios={usuarios} edita={edita} />
                );
              })}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  );
}

function Dato({ k, v, fuerte }: { k: string; v: string; fuerte?: boolean }) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-wide text-neutral-500">{k}</p>
      <p className={`tabular-nums ${fuerte ? "text-xl font-semibold text-primary" : "text-base font-medium"}`}>{v}</p>
    </div>
  );
}
