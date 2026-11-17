"use client";

import * as React from "react";
import {
  Calendar as CalendarIcon,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";

import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import { utcToday } from "@/lib/utils/utc-date";

const MONTH_NAMES_ES = [
  "Enero",
  "Febrero",
  "Marzo",
  "Abril",
  "Mayo",
  "Junio",
  "Julio",
  "Agosto",
  "Septiembre",
  "Octubre",
  "Noviembre",
  "Diciembre",
];

/**
 * Drop-in replacement for <Input type="date"> that always renders
 * dd/mm/yyyy regardless of the user's OS locale.
 *
 * - Accepts/emits YYYY-MM-DD strings in `value` / `onChange`.
 * - Displays dd/mm/yyyy in the text field with a calendar picker popover.
 * - Compatible with react-hook-form `register(...)` and `Controller`'s `field` spread
 *   (onChange gets a synthetic event with target.value = YYYY-MM-DD).
 */

type DateInputProps = Omit<
  React.ComponentProps<"input">,
  "type" | "value" | "defaultValue"
> & {
  value?: string | null;
  defaultValue?: string;
  /** Extra classes for the inner text input (the `className` prop styles the wrapper). */
  inputClassName?: string;
};

const ISO_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const DISPLAY_RE = /^(\d{2})\/(\d{2})\/(\d{4})$/;

function isoToDisplay(iso: string | null | undefined): string {
  if (!iso) return "";
  const m = ISO_RE.exec(iso);
  if (!m) return "";
  return `${m[3]}/${m[2]}/${m[1]}`;
}

function displayToIso(display: string): string | null {
  const m = DISPLAY_RE.exec(display);
  if (!m) return null;
  const day = parseInt(m[1], 10);
  const month = parseInt(m[2], 10);
  const year = parseInt(m[3], 10);
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;
  if (year < 1900 || year > 2200) return null;
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }
  return `${m[3]}-${m[2]}-${m[1]}`;
}

function isoToDate(iso: string | null | undefined): Date | undefined {
  if (!iso) return undefined;
  const m = ISO_RE.exec(iso);
  if (!m) return undefined;
  return new Date(Date.UTC(+m[1], +m[2] - 1, +m[3]));
}

function dateToIso(d: Date): string {
  const y = d.getUTCFullYear();
  const m = String(d.getUTCMonth() + 1).padStart(2, "0");
  const day = String(d.getUTCDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function fireChange(
  onChange: React.ChangeEventHandler<HTMLInputElement> | undefined,
  nextValue: string,
  name: string | undefined,
) {
  if (!onChange) return;
  // Deliver a synthetic event carrying the ISO value. We deliberately do NOT
  // write back to the DOM input (which displays dd/mm/yyyy) — doing so would
  // re-enter handleTextChange with the ISO string and corrupt the display.
  const target = { value: nextValue, name: name ?? "" } as HTMLInputElement;
  const ev = {
    target,
    currentTarget: target,
    type: "change",
    bubbles: true,
  } as unknown as React.ChangeEvent<HTMLInputElement>;
  onChange(ev);
}

const DateInput = React.forwardRef<HTMLInputElement, DateInputProps>(
  function DateInput(
    {
      value,
      defaultValue,
      onChange,
      onBlur,
      onKeyDown,
      name,
      id,
      disabled,
      readOnly,
      min,
      max,
      className,
      inputClassName,
      placeholder = "dd/mm/aaaa",
      ...rest
    },
    forwardedRef,
  ) {
    const innerRef = React.useRef<HTMLInputElement | null>(null);
    const setRef = React.useCallback(
      (el: HTMLInputElement | null) => {
        innerRef.current = el;
        if (typeof forwardedRef === "function") forwardedRef(el);
        else if (forwardedRef) forwardedRef.current = el;
      },
      [forwardedRef],
    );

    const controlled = value !== undefined;
    const initialIso = controlled ? (value ?? "") : (defaultValue ?? "");
    const [display, setDisplay] = React.useState<string>(() =>
      isoToDisplay(initialIso),
    );
    const [open, setOpen] = React.useState(false);

    // Pending caret position after a re-mask; restored on the next layout.
    const pendingCursorRef = React.useRef<number | null>(null);

    React.useLayoutEffect(() => {
      if (pendingCursorRef.current == null) return;
      const pos = pendingCursorRef.current;
      pendingCursorRef.current = null;
      const el = innerRef.current;
      if (!el || document.activeElement !== el) return;
      try {
        el.setSelectionRange(pos, pos);
      } catch {
        // ignore (readonly / non-text inputs)
      }
    }, [display]);

    // Keep display in sync with external value when controlled
    React.useEffect(() => {
      if (!controlled) return;
      setDisplay(isoToDisplay(value));
    }, [controlled, value]);

    const currentIso = controlled
      ? (value ?? "")
      : displayToIso(display) ?? "";

    const minDate = isoToDate(typeof min === "string" ? min : undefined);
    const maxDate = isoToDate(typeof max === "string" ? max : undefined);
    const selectedDate = isoToDate(currentIso);

    const commit = (nextIso: string) => {
      fireChange(onChange, nextIso, name);
    };

    const handleTextChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const raw = input.value;
      const cursorBefore = input.selectionStart ?? raw.length;

      // Count digits in the raw string up to the caret — the caret moves
      // with its digit, not with the surrounding slashes.
      const digitsBeforeCursor = raw
        .slice(0, cursorBefore)
        .replace(/\D/g, "").length;

      const digits = raw.replace(/\D/g, "").slice(0, 8);
      let next = digits;
      if (digits.length > 4)
        next = `${digits.slice(0, 2)}/${digits.slice(2, 4)}/${digits.slice(4)}`;
      else if (digits.length > 2)
        next = `${digits.slice(0, 2)}/${digits.slice(2)}`;

      // Find the position in `next` that sits right after N digits.
      let newCursor = next.length;
      let seen = 0;
      for (let i = 0; i < next.length; i++) {
        if (seen >= digitsBeforeCursor) {
          newCursor = i;
          break;
        }
        if (next[i] >= "0" && next[i] <= "9") seen++;
      }
      // If caret lands on a slash, skip past it so the next keystroke
      // writes into the next segment.
      if (next[newCursor] === "/") newCursor += 1;

      pendingCursorRef.current = newCursor;
      setDisplay(next);

      const iso = displayToIso(next);
      if (iso || next === "") commit(iso ?? "");
    };

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      const iso = displayToIso(display);
      if (iso) setDisplay(isoToDisplay(iso));
      else if (display === "") setDisplay("");
      // else: keep what the user typed so they can see the error
      // register()-style consumers (RHF) re-read target.value on blur; hand
      // them the canonical ISO value, never the dd/mm/aaaa mask.
      if (iso) e.target.value = iso;
      onBlur?.(e);
    };

    const handleSelectDate = (d: Date | undefined) => {
      if (!d) {
        setDisplay("");
        commit("");
        return;
      }
      const iso = dateToIso(d);
      setDisplay(isoToDisplay(iso));
      commit(iso);
      setOpen(false);
    };

    // When the user navigates months via the < / > arrows or dropdowns, keep
    // the same day-of-month selected (clamp if the day doesn't exist, e.g.
    // Jan 31 → Feb 28). Matches native <input type="date"> focus behavior.
    const handleMonthChange = (month: Date) => {
      if (!selectedDate) return;
      const y = month.getUTCFullYear();
      const m = month.getUTCMonth();
      const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
      const safeDay = Math.min(selectedDate.getUTCDate(), lastDay);
      const nextDate = new Date(Date.UTC(y, m, safeDay));
      const nextIso = dateToIso(nextDate);
      if (nextIso === currentIso) return;
      setDisplay(isoToDisplay(nextIso));
      commit(nextIso);
    };

    const currentYear = new Date().getUTCFullYear();
    const dropdownStart =
      minDate ?? new Date(Date.UTC(1920, 0, 1));
    const dropdownEnd =
      maxDate ?? new Date(Date.UTC(currentYear + 10, 11, 31));

    // View month state for the calendar header. Initialized to the selected
    // date, otherwise today. Synced when the external value changes.
    const [viewMonth, setViewMonth] = React.useState<Date>(
      () =>
        selectedDate ??
        new Date(Date.UTC(currentYear, new Date().getUTCMonth(), 1)),
    );

    React.useEffect(() => {
      const d = isoToDate(currentIso);
      if (d) setViewMonth(d);
    }, [currentIso]);

    const navigateMonth = (target: Date) => {
      setViewMonth(target);
      handleMonthChange(target);
    };

    const goPrevMonth = () => {
      navigateMonth(
        new Date(
          Date.UTC(
            viewMonth.getUTCFullYear(),
            viewMonth.getUTCMonth() - 1,
            1,
          ),
        ),
      );
    };

    const goNextMonth = () => {
      navigateMonth(
        new Date(
          Date.UTC(
            viewMonth.getUTCFullYear(),
            viewMonth.getUTCMonth() + 1,
            1,
          ),
        ),
      );
    };

    const setHeaderMonth = (m: number) => {
      navigateMonth(
        new Date(Date.UTC(viewMonth.getUTCFullYear(), m, 1)),
      );
    };

    const setHeaderYear = (y: number) => {
      navigateMonth(
        new Date(Date.UTC(y, viewMonth.getUTCMonth(), 1)),
      );
    };

    const yearStart = dropdownStart.getUTCFullYear();
    const yearEnd = dropdownEnd.getUTCFullYear();
    const yearOptions = React.useMemo(
      () =>
        Array.from(
          { length: yearEnd - yearStart + 1 },
          (_, i) => yearStart + i,
        ),
      [yearStart, yearEnd],
    );

    const viewKey =
      viewMonth.getUTCFullYear() * 12 + viewMonth.getUTCMonth();
    const startKey =
      dropdownStart.getUTCFullYear() * 12 + dropdownStart.getUTCMonth();
    const endKey =
      dropdownEnd.getUTCFullYear() * 12 + dropdownEnd.getUTCMonth();
    const prevDisabled = viewKey <= startKey;
    const nextDisabled = viewKey >= endKey;

    const showTrigger = !readOnly && !disabled;

    return (
      <div className={cn("relative", className)}>
        <Input
          ref={setRef}
          id={id}
          name={name}
          value={display}
          onChange={handleTextChange}
          onBlur={handleBlur}
          onKeyDown={onKeyDown}
          disabled={disabled}
          readOnly={readOnly}
          placeholder={placeholder}
          inputMode="numeric"
          autoComplete="off"
          maxLength={10}
          className={cn("font-mono tabular-nums pr-9", inputClassName)}
          {...rest}
        />
        {showTrigger && (
          <Popover
            open={open}
            onOpenChange={(o) => {
              setOpen(o);
              if (o && selectedDate) setViewMonth(selectedDate);
            }}
          >
            <PopoverTrigger asChild>
              <button
                type="button"
                aria-label="Abrir calendario"
                tabIndex={-1}
                className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex h-6 w-6 items-center justify-center rounded text-[#737373] hover:text-[#1B4332] hover:bg-[#f0f6f2] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#1B4332]/30"
              >
                <CalendarIcon className="h-4 w-4" />
              </button>
            </PopoverTrigger>
            <PopoverContent
              align="end"
              sideOffset={8}
              className="w-auto p-0 border border-[#e8e8e3] shadow-lg rounded-md bg-white"
            >
              <div className="flex items-center justify-between gap-1 px-3 pt-3 pb-2">
                <button
                  type="button"
                  onClick={goPrevMonth}
                  disabled={prevDisabled}
                  aria-label="Mes anterior"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#1B4332] hover:bg-[#f0f6f2] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronLeft className="h-4 w-4" />
                </button>
                <div className="flex items-center gap-1.5">
                  <div className="relative inline-flex items-center gap-1.5 h-8 rounded-md bg-[#f5f5f0] px-2.5 hover:bg-[#ebe9e0] focus-within:ring-2 focus-within:ring-[#1B4332]/30 transition-colors">
                    <span className="capitalize text-[12.5px] font-semibold text-[#1B4332]">
                      {MONTH_NAMES_ES[viewMonth.getUTCMonth()]}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60 text-[#1B4332]" />
                    <select
                      aria-label="Mes"
                      value={viewMonth.getUTCMonth()}
                      onChange={(e) =>
                        setHeaderMonth(parseInt(e.target.value, 10))
                      }
                      className="absolute inset-0 cursor-pointer appearance-none bg-transparent opacity-0"
                    >
                      {MONTH_NAMES_ES.map((n, i) => (
                        <option key={i} value={i}>
                          {n}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div className="relative inline-flex items-center gap-1.5 h-8 rounded-md bg-[#f5f5f0] px-2.5 hover:bg-[#ebe9e0] focus-within:ring-2 focus-within:ring-[#1B4332]/30 transition-colors">
                    <span className="font-mono tabular-nums text-[12.5px] font-semibold text-[#1B4332]">
                      {viewMonth.getUTCFullYear()}
                    </span>
                    <ChevronDown className="h-3 w-3 opacity-60 text-[#1B4332]" />
                    <select
                      aria-label="Año"
                      value={viewMonth.getUTCFullYear()}
                      onChange={(e) =>
                        setHeaderYear(parseInt(e.target.value, 10))
                      }
                      className="absolute inset-0 cursor-pointer appearance-none bg-transparent opacity-0"
                    >
                      {yearOptions.map((y) => (
                        <option key={y} value={y}>
                          {y}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={goNextMonth}
                  disabled={nextDisabled}
                  aria-label="Mes siguiente"
                  className="inline-flex h-8 w-8 items-center justify-center rounded-md text-[#1B4332] hover:bg-[#f0f6f2] disabled:opacity-30 disabled:pointer-events-none transition-colors"
                >
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
              <Calendar
                mode="single"
                captionLayout="label"
                selected={selectedDate}
                onSelect={handleSelectDate}
                month={viewMonth}
                onMonthChange={(m) => {
                  setViewMonth(m);
                  handleMonthChange(m);
                }}
                startMonth={dropdownStart}
                endMonth={dropdownEnd}
                className="p-3 pt-0"
                classNames={{
                  month_caption: "hidden",
                  nav: "hidden",
                }}
                disabled={(date) => {
                  if (minDate && date < minDate) return true;
                  if (maxDate && date > maxDate) return true;
                  return false;
                }}
              />
              {(() => {
                const today = utcToday();
                const todayOutOfRange =
                  (minDate && today < minDate) || (maxDate && today > maxDate);
                return (
                  <div className="flex justify-center border-t border-[#f0f0ec] px-3 py-1.5">
                    <button
                      type="button"
                      onClick={() => handleSelectDate(today)}
                      disabled={!!todayOutOfRange}
                      className="inline-flex h-7 items-center rounded-md px-3 text-[12px] font-medium text-[#1B4332] hover:bg-[#f0f6f2] disabled:opacity-40 disabled:pointer-events-none transition-colors"
                    >
                      Hoy
                    </button>
                  </div>
                );
              })()}
            </PopoverContent>
          </Popover>
        )}
      </div>
    );
  },
);

export { DateInput };
