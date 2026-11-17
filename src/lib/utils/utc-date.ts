/**
 * Centralized UTC date utilities.
 *
 * Prisma stores @db.Date values as UTC midnight. JavaScript's getMonth(),
 * getDate(), getFullYear() use LOCAL timezone, causing off-by-one bugs
 * in UTC-negative zones like Argentina (UTC-3).
 *
 * All date extraction/construction in this codebase MUST use these helpers
 * instead of raw Date methods when operating on Prisma dates.
 */

import { getFakeOffset } from "@/lib/dev/fake-date";

// ---------------------------------------------------------------------------
// Month names (Spanish) — single source of truth
// ---------------------------------------------------------------------------

export const MONTH_NAMES = [
  "Enero", "Febrero", "Marzo", "Abril", "Mayo", "Junio",
  "Julio", "Agosto", "Septiembre", "Octubre", "Noviembre", "Diciembre",
] as const;

const DAY_NAMES = [
  "Domingo", "Lunes", "Martes", "Miércoles",
  "Jueves", "Viernes", "Sábado",
] as const;

const DAY_ABBR = ["dom", "lun", "mar", "mie", "jue", "vie", "sab"] as const;

// ---------------------------------------------------------------------------
// Core primitives
// ---------------------------------------------------------------------------

/** Create a Date at UTC midnight from year, 0-indexed month, day. */
export function utcDate(y: number, m: number, d: number): Date {
  return new Date(Date.UTC(y, m, d));
}

/** Extract UTC full year from a Date. */
export function utcYear(d: Date): number {
  return d.getUTCFullYear();
}

/** Extract UTC 0-indexed month from a Date. */
export function utcMonth(d: Date): number {
  return d.getUTCMonth();
}

/** Extract UTC day-of-month from a Date. */
export function utcDay(d: Date): number {
  return d.getUTCDate();
}

/** Today as UTC midnight. Applies the dev god-mode fake-date offset if set. */
export function utcToday(): Date {
  const now = new Date(Date.now() + getFakeOffset());
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/**
 * UTC-safe difference in calendar months between two dates, using UTC getters.
 * Returns the number of whole months from `earlier` to `later` (later - earlier).
 * Negative if `earlier` is after `later`.
 */
export function utcMonthDiff(later: Date, earlier: Date): number {
  return (later.getUTCFullYear() - earlier.getUTCFullYear()) * 12
       + (later.getUTCMonth() - earlier.getUTCMonth());
}

/**
 * UTC-safe difference in calendar days between two dates.
 * Returns the number of whole days from `earlier` to `later` (later - earlier).
 * Inputs are expected to be UTC-midnight Date objects (the project convention);
 * the implementation works on raw timestamps, so it's timezone-agnostic.
 */
export function utcDayDiff(later: Date, earlier: Date): number {
  const MS_PER_DAY = 86_400_000;
  return Math.round((later.getTime() - earlier.getTime()) / MS_PER_DAY);
}

// ---------------------------------------------------------------------------
// Period helpers
// ---------------------------------------------------------------------------

/** Format year + 0-indexed month as "YYYY-MM", or extract from a Date. */
export function formatPeriod(yOrDate: number | Date, m?: number): string {
  if (yOrDate instanceof Date) {
    return `${yOrDate.getUTCFullYear()}-${String(yOrDate.getUTCMonth() + 1).padStart(2, "0")}`;
  }
  return `${yOrDate}-${String(m! + 1).padStart(2, "0")}`;
}

/** Parse "YYYY-MM" to { year, month } where month is 0-indexed. */
export function parsePeriod(s: string): { year: number; month: number } {
  const [y, m] = s.split("-").map(Number);
  return { year: y, month: m - 1 };
}

/** "2026-03" -> "Marzo 2026". Also accepts a Date. */
export function formatPeriodLabel(periodOrDate: string | Date): string {
  if (periodOrDate instanceof Date) {
    return `${MONTH_NAMES[periodOrDate.getUTCMonth()]} ${periodOrDate.getUTCFullYear()}`;
  }
  const { year, month } = parsePeriod(periodOrDate);
  return `${MONTH_NAMES[month]} ${year}`;
}

/** "2026-03" -> "Mar 2026". Returns "—" for null. */
export function formatPeriodShort(period: string | null): string {
  if (!period) return "—";
  const { year, month } = parsePeriod(period);
  return `${MONTH_NAMES[month].slice(0, 3)} ${year}`;
}

/** Advance to next month (0-indexed). */
export function nextMonth(y: number, m: number): { year: number; month: number } {
  if (m >= 11) return { year: y + 1, month: 0 };
  return { year: y, month: m + 1 };
}

/**
 * Primer día (UTC) del mes de `d`. Ancla canónica de todo lo que es "un mes":
 * los GroupExpensePeriod viven siempre en el día 1.
 */
export function startOfUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
}

/**
 * Primer día (UTC) del mes SIGUIENTE al de `d`. Es la cota para preguntar
 * "¿esta fecha cae en un mes posterior al de `d`?" sin que una fila fechada a
 * mitad de mes (15/07) cuente como posterior al mes que la contiene (01/07).
 */
export function startOfNextUtcMonth(d: Date): Date {
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 1));
}

// ---------------------------------------------------------------------------
// Formatting
// ---------------------------------------------------------------------------

/** Format a Date as "dd/mm/yyyy" using UTC getters. */
export function formatDateAR(d: Date): string {
  const day = String(d.getUTCDate()).padStart(2, "0");
  const month = String(d.getUTCMonth() + 1).padStart(2, "0");
  const year = d.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

/** Format a Date as "mar 3 nov 2026" (abbreviated weekday + day + month + year), UTC-based. */
export function formatDateShortAR(d: Date): string {
  const dayName = DAY_ABBR[d.getUTCDay()];
  const monthName = MONTH_NAMES[d.getUTCMonth()].slice(0, 3).toLowerCase();
  return `${dayName} ${d.getUTCDate()} ${monthName} ${d.getUTCFullYear()}`;
}

/**
 * Format a contract's start/end as a "dd/mm/yyyy - dd/mm/yyyy" range.
 * Accepts Date or string (Prisma serializes DateTime to ISO strings on the
 * client), normalizing the same way `formatContractName` does. UTC-based via
 * `formatDateAR`, so it never drifts a day in negative offsets.
 */
export function formatContractDateRange(
  start: Date | string,
  end: Date | string
): string {
  const s = typeof start === "string" ? new Date(start) : start;
  const e = typeof end === "string" ? new Date(end) : end;
  return `${formatDateAR(s)} - ${formatDateAR(e)}`;
}

/**
 * Format a date string "YYYY-MM-DD" as "dd/mm" (no year) — used for compact
 * vencimiento displays (popovers, diff dialogs). Pure string slicing, no
 * Date parsing needed since the input is already zero-padded ISO.
 */
export function formatDayMonth(isoDate: string): string {
  const [, mm, dd] = isoDate.split("-");
  return `${dd}/${mm}`;
}

/**
 * Format a date string "YYYY-MM-DD" as "dd/mm/aaaa".
 *
 * Hermana de `formatDateAR`, que toma un Date: cuando el dato YA es ISO, pasar
 * por Date solo agrega la chance de correrse un dia. Puro slicing.
 */
export function formatDateFromISO(isoDate: string): string {
  const [y, m, d] = isoDate.split("-");
  return `${d}/${m}/${y}`;
}

/**
 * Format a date string "YYYY-MM-DD" as "Lunes 5 de marzo" for day headers.
 * Parses as UTC to avoid timezone shifts.
 */
export function formatDayHeaderAR(dateStr: string): string {
  const [y, m, d] = dateStr.split("-").map(Number);
  const date = utcDate(y, m - 1, d);
  const dayName = DAY_NAMES[date.getUTCDay()];
  const monthName = MONTH_NAMES[date.getUTCMonth()].toLowerCase();
  return `${dayName} ${d} de ${monthName}`;
}
