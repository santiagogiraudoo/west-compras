"use client";

import { cn, formatCurrency, isKnownCurrency } from "@/lib/utils";
import { UnknownCurrencyMark } from "./UnknownCurrencyMark";

interface MoneyCellProps {
  value: number;
  /**
   * Obligatoria a proposito. Con default "ARS" un olvido del caller imprimia
   * dolares con signo de pesos y no habia forma de distinguirlo de un monto
   * en pesos de verdad.
   */
  currency: string;
  decimals?: number;
  className?: string;
}

/**
 * Renders a formatted money amount matching the rest of the app:
 * Inter `tabular-nums font-medium`, $-prefixed via formatCurrency.
 *
 * Caller passes color/size/weight overrides through `className`.
 */
export function MoneyCell({
  value,
  currency,
  decimals,
  className,
}: MoneyCellProps) {
  const formatted = formatCurrency(
    value,
    currency,
    decimals != null ? { decimals } : undefined,
  );

  if (!isKnownCurrency(currency)) {
    // El flex va en un span interno, no en el que absorbe `className`: si el
    // caller pasa "block" (p.ej. GastosSummaryCards con truncate),
    // tailwind-merge lo deja ganar por compartir grupo con "inline-flex" y
    // el layout de la marca se rompe. Envolviendo adentro, className nunca
    // lo toca.
    return (
      <span className={cn("tabular-nums font-medium", className)}>
        <span className="inline-flex items-baseline gap-1">
          {formatted}
          <UnknownCurrencyMark />
        </span>
      </span>
    );
  }

  return (
    <span className={cn("tabular-nums font-medium", className)}>
      {formatted}
    </span>
  );
}
