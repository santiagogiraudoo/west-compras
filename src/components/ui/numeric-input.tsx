import * as React from "react"
import { Input } from "./input"
import { cn, currencySymbol, currencyPrefixPadding } from "@/lib/utils"

interface NumericInputBaseProps
  extends Omit<React.ComponentProps<"input">, "value" | "onChange" | "type"> {
  /** Current numeric value. null/undefined renders as empty field. */
  value: number | null | undefined
  /** Called with the new numeric value, or null when field is empty. */
  onValueChange: (value: number | null) => void
  /** Allow decimal values (default: true) */
  decimals?: boolean
}

/**
 * `currencyMask` y `currency` van juntas y el compilador lo exige: el símbolo
 * lo decide la moneda, no el componente. Cuando el prefijo era un "$" fijo, un
 * campo en dólares se editaba con signo de pesos y nada lo delataba —el número
 * no se formatea mientras se tipea, así que no hay ningún formateador de por
 * medio al que `tsc` pueda pedirle la moneda—.
 *
 * Sin `currencyMask` el input es numérico y punto: meses, porcentajes, tasas.
 * Ahí no hay moneda que pasar, y pasarla es un error de tipos.
 */
type NumericInputProps = NumericInputBaseProps &
  (
    | { currencyMask: true; currency: string }
    | { currencyMask?: false; currency?: never }
  )

/**
 * Numeric input that allows clearing to empty (no stuck "0" problem).
 * Uses type="text" + inputMode for proper UX while keeping numeric semantics.
 */
const NumericInput = React.forwardRef<HTMLInputElement, NumericInputProps>(
  (props, ref) => {
    if (props.currencyMask) {
      return <CurrencyMaskedInput ref={ref} {...props} />
    }
    return <PlainNumericInput ref={ref} {...props} />
  }
)

NumericInput.displayName = "NumericInput"

// ============================================================
// Default (no mask) — preserves prior behavior for all callers
// ============================================================

type PlainProps = NumericInputBaseProps & {
  currencyMask?: boolean
  currency?: string
}

const PlainNumericInput = React.forwardRef<HTMLInputElement, PlainProps>(
  ({ value, onValueChange, decimals = true, currencyMask: _ignored, currency: _ignoredCurrency, className, ...props }, ref) => {
    void _ignored
    void _ignoredCurrency
    const [displayValue, setDisplayValue] = React.useState(() =>
      value != null ? String(value) : ""
    )

    React.useEffect(() => {
      const externalStr = value != null ? String(value) : ""
      const currentNum = displayValue === "" ? null : Number(displayValue)
      if (value !== currentNum) {
        setDisplayValue(externalStr)
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const raw = e.target.value

      if (raw === "") {
        setDisplayValue("")
        onValueChange(null)
        return
      }

      if (raw === "-") {
        setDisplayValue("-")
        return
      }

      if (decimals && /^-?\d+[.,]$/.test(raw)) {
        setDisplayValue(raw)
        return
      }

      const pattern = decimals ? /^-?\d*[.,]?\d*$/ : /^-?\d*$/
      if (!pattern.test(raw)) return

      const normalized = raw.replace(",", ".")
      setDisplayValue(raw)

      const num = Number(normalized)
      if (!isNaN(num)) {
        onValueChange(num)
      }
    }

    const handleBlur = (e: React.FocusEvent<HTMLInputElement>) => {
      if (displayValue !== "" && displayValue !== "-") {
        const normalized = displayValue.replace(",", ".")
        const num = Number(normalized)
        if (!isNaN(num)) {
          setDisplayValue(String(num))
        }
      }
      props.onBlur?.(e)
    }

    return (
      <Input
        ref={ref}
        type="text"
        inputMode={decimals ? "decimal" : "numeric"}
        className={cn("font-mono", className)}
        value={displayValue}
        onChange={handleChange}
        onBlur={handleBlur}
        {...props}
      />
    )
  }
)

PlainNumericInput.displayName = "PlainNumericInput"

// ============================================================
// Currency-masked variant (Argentine: $ 1.234,56)
// ============================================================

/** Format a clean numeric string ("-1234.5") with es-AR thousand separators ("-1.234,5"). */
function formatARThousands(raw: string): string {
  if (raw === "" || raw === "-") return raw
  const negative = raw.startsWith("-")
  const unsigned = negative ? raw.slice(1) : raw
  const dotIdx = unsigned.indexOf(".")
  const intPart = dotIdx === -1 ? unsigned : unsigned.slice(0, dotIdx)
  const fractPart = dotIdx === -1 ? null : unsigned.slice(dotIdx + 1)

  let intFormatted: string
  if (intPart === "") {
    intFormatted = ""
  } else {
    const n = Number(intPart)
    intFormatted = isNaN(n) ? intPart : n.toLocaleString("es-AR")
  }

  let out = `${negative ? "-" : ""}${intFormatted}`
  if (fractPart !== null) out += `,${fractPart}`
  return out
}

/**
 * Format an external (prop) value for display. Money shows at most 2 decimals:
 * valores programáticos (ej. neto back-solved = total/1.21) guardan precisión
 * completa en el estado, pero el campo nunca debe pintar colas de float.
 */
function formatExternalMoney(value: number): string {
  return formatARThousands(String(Math.round(value * 100) / 100))
}

/** Strip mask chars from a displayed value, returning a clean numeric string ("1234.5"). */
function unmaskAR(displayed: string): string {
  let raw = displayed.replace(/[^\d,\-]/g, "")
  const negative = raw.startsWith("-")
  raw = (negative ? "-" : "") + raw.replace(/-/g, "")
  const commaIdx = raw.indexOf(",")
  if (commaIdx !== -1) {
    raw = raw.slice(0, commaIdx) + "." + raw.slice(commaIdx + 1).replace(/,/g, "")
  }
  return raw
}

/** Count digit/comma/minus chars in `s` up to (but not including) `upTo`. */
function countMaskUserChars(s: string, upTo: number): number {
  let n = 0
  const end = Math.min(upTo, s.length)
  for (let i = 0; i < end; i++) {
    if (/[\d,\-]/.test(s[i])) n++
  }
  return n
}

/** Find caret position in `s` immediately after the `count`-th digit/comma/minus. */
function caretAfterUserChars(s: string, count: number): number {
  if (count <= 0) return 0
  let n = 0
  for (let i = 0; i < s.length; i++) {
    if (/[\d,\-]/.test(s[i])) {
      n++
      if (n === count) return i + 1
    }
  }
  return s.length
}

type MaskedProps = NumericInputBaseProps & {
  currencyMask?: boolean
  currency: string
}

const CurrencyMaskedInput = React.forwardRef<HTMLInputElement, MaskedProps>(
  ({ value, onValueChange, decimals = true, currencyMask: _ignored, currency, className, disabled, ...props }, ref) => {
    void _ignored
    void decimals
    const innerRef = React.useRef<HTMLInputElement | null>(null)
    React.useImperativeHandle(ref, () => innerRef.current as HTMLInputElement)

    const [displayValue, setDisplayValue] = React.useState(() =>
      value != null ? formatExternalMoney(value) : ""
    )
    const pendingCaret = React.useRef<number | null>(null)

    React.useEffect(() => {
      const currentRaw = unmaskAR(displayValue)
      const currentNum = currentRaw === "" || currentRaw === "-" ? null : Number(currentRaw)
      if (value !== currentNum) {
        setDisplayValue(value != null ? formatExternalMoney(value) : "")
      }
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [value])

    React.useLayoutEffect(() => {
      if (pendingCaret.current != null && innerRef.current) {
        const pos = pendingCaret.current
        innerRef.current.setSelectionRange(pos, pos)
        pendingCaret.current = null
      }
    })

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const target = e.target
      const newDisplay = target.value
      const oldCaret = target.selectionStart ?? newDisplay.length
      const userCharsBeforeCaret = countMaskUserChars(newDisplay, oldCaret)

      const raw = unmaskAR(newDisplay)
      const formatted = formatARThousands(raw)

      setDisplayValue(formatted)

      let num: number | null
      if (raw === "" || raw === "-") {
        num = null
      } else {
        const parsed = Number(raw)
        num = isNaN(parsed) ? null : parsed
      }
      onValueChange(num)

      pendingCaret.current = caretAfterUserChars(formatted, userCharsBeforeCaret)
    }

    const symbol = currencySymbol(currency)

    return (
      <div className="relative">
        {symbol && (
          <span
            aria-hidden
            className="pointer-events-none select-none absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"
          >
            {symbol}
          </span>
        )}
        <Input
          ref={innerRef}
          type="text"
          inputMode="decimal"
          className={cn(
            "font-mono tabular-nums",
            currencyPrefixPadding(symbol),
            className,
          )}
          value={displayValue}
          onChange={handleChange}
          disabled={disabled}
          {...props}
        />
      </div>
    )
  }
)

CurrencyMaskedInput.displayName = "CurrencyMaskedInput"

export { NumericInput }
export type { NumericInputProps }
