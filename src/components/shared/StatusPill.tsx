import type { LucideIcon } from "lucide-react";

/**
 * Colores del D-pattern (barra izquierda de 3px + fondo teñido) de la app de
 * alquileres, los mismos hex que su src/lib/constants/pill-colors.ts:
 * success = verde institucional · red = grave/bloquea · orange = vencido ·
 * amber = espera o excepción · indigo = manual · slate y neutral = informativo.
 */
export const PILL_TONES = {
  success: { bg: "#f0f6f2", text: "#0f2a1f", bar: "#1B4332" },
  red:     { bg: "#fef2f2", text: "#991b1b", bar: "#dc2626" },
  orange:  { bg: "#fff7ed", text: "#9a3412", bar: "#ea580c" },
  amber:   { bg: "#fffbeb", text: "#92400e", bar: "#f59e0b" },
  indigo:  { bg: "#eef2ff", text: "#3730a3", bar: "#6366f1" },
  slate:   { bg: "#f1f5f9", text: "#334155", bar: "#64748b" },
  neutral: { bg: "#f5f5f0", text: "#737373", bar: "#a3a3a3" },
} as const;

export type PillTone = keyof typeof PILL_TONES;

interface StatusPillProps {
  tone: PillTone;
  children: React.ReactNode;
  icon?: LucideIcon;
  size?: "sm" | "md";
  className?: string;
}

/**
 * El chip de estado de la app de alquileres (StatusPill, ContractStatusPill,
 * PaidStatusPill tienen todos este aspecto). Allá cada uno recibe su estado; acá
 * recibe el tono y el texto porque los estados de compras son otros.
 */
export function StatusPill({ tone, children, icon: Icon, size = "sm", className = "" }: StatusPillProps) {
  const colors = PILL_TONES[tone];

  const sizeClasses =
    size === "sm"
      ? "text-[10.5px] px-2.5 py-[3px] gap-1.5"
      : "text-[11.5px] px-3 py-1 gap-1.5";

  const iconSize = size === "sm" ? "h-3 w-3" : "h-3.5 w-3.5";

  return (
    <span
      className={`inline-flex items-center rounded-[3px] font-semibold tracking-[0.03em] border-l-[3px] ${sizeClasses} ${className}`}
      style={{
        background: colors.bg,
        color: colors.text,
        borderLeftColor: colors.bar,
      }}
    >
      {Icon && <Icon className={`${iconSize} shrink-0`} strokeWidth={2.2} />}
      {children}
    </span>
  );
}
