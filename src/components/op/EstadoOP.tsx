import { Ban, CheckCheck, CheckCircle, Clock, MessageSquareWarning, PencilLine, Trash2, type LucideIcon } from "lucide-react";
import { StatusPill, type PillTone } from "@/components/shared/StatusPill";
import type { EstadoOP } from "@/lib/op/estados";

export const ESTADO_OP: Record<EstadoOP, { tone: PillTone; icon: LucideIcon }> = {
  "En armado": { tone: "slate", icon: PencilLine },
  "A aprobar": { tone: "amber", icon: Clock },
  Observada: { tone: "orange", icon: MessageSquareWarning },
  Bloqueada: { tone: "red", icon: Ban },
  Autorizada: { tone: "success", icon: CheckCircle },
  Pagada: { tone: "success", icon: CheckCheck },
  Descartada: { tone: "neutral", icon: Trash2 },
};

/** El estado de una OP de la app (app.v_op_estado), con el chip de estado de alquileres. */
export function EstadoOPBadge({ estado, size = "sm" }: { estado: EstadoOP; size?: "sm" | "md" }) {
  const e = ESTADO_OP[estado];
  return <StatusPill tone={e.tone} icon={e.icon} size={size}>{estado}</StatusPill>;
}
