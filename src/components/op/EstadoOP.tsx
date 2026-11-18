import type { EstadoOP } from "@/lib/op/estados";

const COLOR: Record<EstadoOP, string> = {
  "En armado": "border-slate-200 bg-slate-50 text-slate-700",
  "A aprobar": "border-amber-200 bg-amber-50 text-amber-900",
  Observada: "border-orange-200 bg-orange-50 text-orange-900",
  Bloqueada: "border-red-200 bg-red-50 text-red-800",
  Autorizada: "border-emerald-200 bg-emerald-50 text-emerald-900",
  Pagada: "border-emerald-300 bg-emerald-100 text-emerald-900",
  Descartada: "border-slate-200 bg-slate-100 text-slate-500",
};

/** El estado de una OP de la app (app.v_op_estado) como etiqueta. */
export function EstadoOPBadge({ estado }: { estado: EstadoOP }) {
  return <span className={`rounded-full border px-2 py-0.5 text-xs ${COLOR[estado]}`}>{estado}</span>;
}
