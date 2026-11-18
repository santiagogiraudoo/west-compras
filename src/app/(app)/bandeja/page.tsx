import Link from "next/link";
import { CheckCircle, CircleAlert, Clock, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatDate } from "@/lib/utils";
import { listarBandeja } from "@/lib/facturas/queries";

export const dynamic = "force-dynamic";

type Fila = Awaited<ReturnType<typeof listarBandeja>>[number];
type Grupo = "falta" | "excepcion" | "lista";

const TH = "text-xs font-semibold uppercase tracking-wide";
const GOLD = { color: "#B8960C" };

/** Los grupos de Cobros pendientes de alquileres: el encabezado teñido dice qué hay que hacer. */
const GRUPOS: { clave: Grupo; titulo: string; nota: string; icon: LucideIcon; cabeza: string; borde: string }[] = [
  { clave: "falta", titulo: "Le falta algo", nota: "Completá lo que dice cada una para poder aprobarla", icon: XCircle,
    cabeza: "bg-red-50 text-red-800", borde: "border-l-red-500" },
  { clave: "excepcion", titulo: "Excepción", nota: "Se aprueba igual explicando por qué", icon: CircleAlert,
    cabeza: "bg-amber-50 text-amber-900", borde: "border-l-amber-500" },
  { clave: "lista", titulo: "Lista para aprobar", nota: "Tiene todo: solo falta la firma", icon: CheckCircle,
    cabeza: "bg-[#f0f6f2] text-[#0f2a1f]", borde: "border-l-transparent" },
];

const grupoDe = (f: Fila): Grupo =>
  f.requisitos.faltan.length > 0 ? "falta" : f.requisitos.excepciones.length > 0 ? "excepcion" : "lista";

/**
 * Bandeja de facturas: solo las que no pasaron solas, agrupadas por lo que hay que hacer
 * (como los grupos de Cobros pendientes de alquileres). Tocar una abre su ficha.
 */
export default async function BandejaPage() {
  const filas = await listarBandeja();

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Bandeja de facturas</h1>
        <p className="text-sm text-muted-foreground">
          Las que esperan aprobación o tienen algo que frena. Lo completo pasa solo.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">Nada en la bandeja.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-border/60 bg-white">
          {GRUPOS.map((g) => {
            const lista = filas.filter((f) => grupoDe(f) === g.clave);
            if (lista.length === 0) return null;
            const total = lista.reduce((t, f) => t + f.total, 0);
            return (
              <section key={g.clave}>
                <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm font-semibold ${g.cabeza}`}>
                  <g.icon className="h-4 w-4" />
                  {g.titulo}
                  <span className="font-normal opacity-80">— {lista.length} {lista.length === 1 ? "factura" : "facturas"} · </span>
                  <MoneyCell value={total} currency="ARS" decimals={2} className="font-semibold" />
                  <span className="ml-auto text-xs font-normal opacity-80">{g.nota}</span>
                </div>
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className={TH} style={GOLD}>Fecha</TableHead>
                      <TableHead className={TH} style={GOLD}>Proveedor</TableHead>
                      <TableHead className={TH} style={GOLD}>Comprobante</TableHead>
                      <TableHead className={`text-right ${TH}`} style={GOLD}>Total</TableHead>
                      <TableHead className={TH} style={GOLD}>Qué tiene</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {lista.map((f) => (
                      <TableRow key={f.id} className={`group relative border-l-4 ${g.borde}`}>
                        <TableCell>{formatDate(f.fecha)}</TableCell>
                        <TableCell className="min-w-[140px] whitespace-normal">{f.proveedor}</TableCell>
                        <TableCell>
                          {/* El link cubre toda la fila: tocar cualquier lado abre la ficha */}
                          <Link href={`/bandeja/${f.id}`} className="font-medium text-primary after:absolute after:inset-0">
                            {f.tipo} {f.numero}
                          </Link>
                        </TableCell>
                        <TableCell className="text-right"><MoneyCell value={f.total} currency="ARS" decimals={2} /></TableCell>
                        <TableCell className="min-w-[220px] whitespace-normal">
                          <div className="flex flex-wrap gap-1">
                            {f.requisitos.faltan.map((m) => <StatusPill key={m} tone="red" icon={TriangleAlert}>{m}</StatusPill>)}
                            {f.requisitos.excepciones.map((m) => <StatusPill key={m} tone="amber" icon={CircleAlert}>{m}</StatusPill>)}
                            {g.clave === "lista" && f.estado === "Pendiente" && <StatusPill tone="amber" icon={Clock}>Sin aprobar</StatusPill>}
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </section>
            );
          })}
        </div>
      )}
    </div>
  );
}
