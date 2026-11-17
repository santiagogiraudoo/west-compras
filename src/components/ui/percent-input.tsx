"use client";

import * as React from "react";
import { Input } from "./input";
import { cn } from "@/lib/utils";

export interface PercentInputProps {
  /** Fraction value (0.05 = 5%). null/undefined renders empty. */
  value: number | null | undefined;
  /** Called with fraction (0.05 = 5%), or null when cleared. */
  onValueChange: (value: number | null) => void;
  id?: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}

/**
 * Percent input (Argentine locale). Displays a fraction as "70,04 %".
 * Accepts user input with comma or dot as decimal separator.
 */
export function PercentInput({
  value,
  onValueChange,
  id,
  placeholder = "0,00",
  className,
  disabled,
}: PercentInputProps) {
  // Fraction × 100 → percentage, formatted with comma decimal
  const formatDisplay = (v: number | null | undefined): string => {
    if (v === null || v === undefined) return "";
    const pct = v * 100;
    // 2 decimal places max, strip trailing zeros, comma as decimal
    return pct.toFixed(2).replace(/\.?0+$/, "").replace(".", ",");
  };

  const parseComma = (s: string): number | null => {
    if (s === "" || s === "-") return null;
    const normalized = s.replace(",", ".");
    const n = Number(normalized);
    return isNaN(n) ? null : n;
  };

  const [displayValue, setDisplayValue] = React.useState(() => formatDisplay(value));

  // Sync external value → display (avoid overwriting mid-edit)
  React.useEffect(() => {
    const nextDisplay = formatDisplay(value);
    const currentNum = parseComma(displayValue);
    const displayMatchesValue =
      value === null || value === undefined
        ? currentNum === null
        : currentNum !== null && Math.abs(currentNum / 100 - value) < 1e-10;
    if (!displayMatchesValue) {
      setDisplayValue(nextDisplay);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;

    if (raw === "") {
      setDisplayValue("");
      onValueChange(null);
      return;
    }

    // Allow trailing decimal separator while typing
    if (/^\d+[.,]$/.test(raw) || /^\d+$/.test(raw) || /^\d+[.,]\d*$/.test(raw)) {
      setDisplayValue(raw);
      const n = parseComma(raw);
      if (n !== null) {
        onValueChange(n / 100);
      }
    }
  };

  return (
    <div className={cn("relative", className)}>
      <Input
        id={id}
        type="text"
        inputMode="decimal"
        value={displayValue}
        onChange={handleChange}
        placeholder={placeholder}
        disabled={disabled}
        className="pr-8 text-right font-mono"
      />
      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-muted-foreground pointer-events-none">
        %
      </span>
    </div>
  );
}
