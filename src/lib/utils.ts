import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/** Format a Date or ISO string to dd/mm/yyyy using Argentine locale.
 *  Uses timeZone:'UTC' so Prisma @db.Date values (UTC midnight) are not
 *  shifted backward by the local UTC-3 offset. */
export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return '-';
  const date = typeof d === 'string'
    ? (/^\d{4}-\d{2}-\d{2}$/.test(d) ? parseDateString(d) : new Date(d))
    : d;
  if (isNaN(date.getTime())) return '-';
  return new Intl.DateTimeFormat('es-AR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    timeZone: 'UTC',
  }).format(date);
}

/** Monedas que la app sabe imprimir. Todo lo demas es "no se". */
export function isKnownCurrency(currency: string): boolean {
  return currency === "ARS" || currency === "USD";
}

// Un aviso por valor distinto: si un endpoint devuelve basura, se ve una vez
// y no mil por cada celda de una tabla.
const warnedCurrencies = new Set<string>();

/**
 * Format a number as currency for display.
 * ARS: no decimals (e.g., "$ 150.000")
 * USD: 2 decimals (e.g., "US$ 1.500,00")
 * Pass `{ decimals: 0 }` to force no decimals regardless of currency.
 *
 * `currency` es OBLIGATORIA a proposito. Cuando tenia default "ARS", no pasarla
 * y pasar "ARS" eran indistinguibles, asi que un olvido imprimia dolares con
 * signo de pesos y nadie lo notaba.
 */
export function formatCurrency(
  amount: number | string,
  currency: string,
  options?: { decimals?: number },
): string {
  const num = typeof amount === "string" ? Number(amount) : amount;

  if (!isKnownCurrency(currency)) {
    if (!warnedCurrencies.has(currency)) {
      warnedCurrencies.add(currency);
      console.warn(
        `formatCurrency: moneda desconocida ${JSON.stringify(currency)} — el monto se muestra sin simbolo.`,
      );
    }
    const decimals = options?.decimals ?? 0;
    return new Intl.NumberFormat("es-AR", {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(isNaN(num) ? 0 : num);
  }

  const isUSD = currency === "USD";
  const decimals = options?.decimals ?? (isUSD ? 2 : 0);
  if (isNaN(num)) {
    // Cero pelado si nadie pidio decimales, y con los que pidio si los pidio:
    // devolver "$ 0" en una columna de dos decimales desalineaba justo la
    // celda rota, que es la que uno quiere mirar.
    if (options?.decimals == null) return isUSD ? "US$ 0" : "$ 0";
    return new Intl.NumberFormat("es-AR", {
      style: "currency",
      currency: isUSD ? "USD" : "ARS",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(0);
  }
  return new Intl.NumberFormat("es-AR", {
    style: "currency",
    currency: isUSD ? "USD" : "ARS",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(num);
}

/**
 * Simbolo que precede a un monto de esa moneda: "$" para pesos, "US$" para
 * dolares, y nada para una moneda que la app no conoce.
 *
 * Existe para los INPUTS, que muestran el simbolo aparte del numero porque el
 * usuario escribe adentro y no se puede formatear al vuelo. Un input con "$"
 * fijo al lado de un campo en dolares es el mismo enganio que motivo hacer la
 * moneda obligatoria, con la diferencia de que un glifo suelto tsc no lo ve.
 */
export function currencySymbol(currency: string): string {
  if (currency === "USD") return "US$";
  if (currency === "ARS") return "$";
  return "";
}

/**
 * Padding izquierdo que necesita un input para que el numero no se monte sobre
 * el simbolo: "US$" ocupa mas que "$", y una moneda desconocida no ocupa nada.
 */
export function currencyPrefixPadding(symbol: string): string {
  if (symbol.length > 1) return "pl-11";
  return symbol ? "pl-7" : "pl-3";
}

/** Pluralize "mes/meses" correctly for Spanish */
export function pluralizeMeses(n: number): string {
  return n === 1 ? '1 mes' : `${n} meses`;
}

/**
 * Parse a "YYYY-MM-DD" string into a Date at UTC midnight.
 * new Date("2026-03-01") parses as UTC midnight but new Date(year, month, day)
 * uses local time which shifts the date in timezones west of UTC (e.g. Argentina
 * UTC-3 would shift October 1 to September 30 at 21:00 UTC).
 * This function uses Date.UTC() to always produce UTC midnight, consistent with
 * how Prisma stores @db.Date values.
 */
export function parseDateString(dateStr: string): Date {
  const [year, month, day] = dateStr.split("-").map(Number);
  return new Date(Date.UTC(year, month - 1, day));
}

/** Convert a Date or ISO string to YYYY-MM-DD.
 *  Uses UTC getters so both parseDateString results (local midnight = same
 *  UTC day in Argentina) and Prisma @db.Date values (UTC midnight) are
 *  formatted without timezone shift. */
export function toLocalDateString(d: Date | string): string {
  if (typeof d === "string") {
    if (/^\d{4}-\d{2}-\d{2}$/.test(d)) return d;
    return toLocalDateString(new Date(d));
  }
  const year = d.getUTCFullYear();
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}
