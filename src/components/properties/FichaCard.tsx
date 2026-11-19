import type { ComponentProps, ReactNode } from "react";
import type { LucideIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

/**
 * Las piezas de presentacion del detalle de propiedad (rediseño opcion C,
 * `design_handoff_propiedad/`): la tarjeta con barra verde, su boton
 * translucido y las celdas de dato con label dorado.
 *
 * Solo forma: no leen ni escriben nada. Las comparten la ficha y el costo del
 * activo para que las dos tarjetas midan exactamente lo mismo.
 */

export function FichaCard({
  icon: Icon,
  title,
  actions,
  barClassName,
  className,
  children,
}: {
  icon: LucideIcon;
  title: ReactNode;
  /** Botones de la barra, a la derecha. */
  actions?: ReactNode;
  /** Para la tarjeta de venta, que va en ambar en vez de verde. */
  barClassName?: string;
  className?: string;
  children: ReactNode;
}) {
  return (
    <section
      className={cn(
        "overflow-hidden rounded-[12px] border border-border bg-white shadow-[0_1px_2px_rgba(0,0,0,.03)]",
        className
      )}
    >
      <div
        className={cn(
          "flex h-11 items-center justify-between gap-3 bg-primary px-5 text-white",
          barClassName
        )}
      >
        <h3 className="flex items-center gap-2 text-[12.5px] font-semibold uppercase tracking-[0.06em]">
          <Icon className="h-4 w-4 text-white/70" />
          {title}
        </h3>
        {actions && <div className="flex items-center gap-2">{actions}</div>}
      </div>
      {children}
    </section>
  );
}

/** El boton blanco translucido de la barra verde: 28px, radio 6. */
export function FichaBarButton({ className, ...props }: ComponentProps<typeof Button>) {
  return (
    <Button
      size="sm"
      variant="outline"
      className={cn(
        "h-7 gap-1.5 rounded-[6px] border-white/30 bg-transparent px-2.5 text-xs font-medium text-white hover:bg-white/10 hover:text-white",
        className
      )}
      {...props}
    />
  );
}

/** El label dorado de un dato: 10.5px, mayusculas. */
export function FichaLabel({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <span
      className={cn(
        "text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]",
        className
      )}
    >
      {children}
    </span>
  );
}

/**
 * Una celda de dato de las grillas de 4: label arriba, valor abajo. Sin valor,
 * una raya gris clara, como en el diseño.
 */
export function FichaDato({
  label,
  value,
  numerico,
}: {
  label: string;
  value: ReactNode | null;
  /** Numeros tabulares, para m² y años. */
  numerico?: boolean;
}) {
  const vacio = value == null || value === "";
  return (
    <div className="flex flex-col gap-[3px] border-r border-[#f2f1ec] px-5 py-3.5 last:border-r-0">
      <FichaLabel>{label}</FichaLabel>
      <span
        className={cn(
          "text-[13.5px] font-medium",
          numerico && "tabular-nums",
          vacio && "text-[#c4c3bd]"
        )}
      >
        {vacio ? "—" : value}
      </span>
    </div>
  );
}

/** El marco redondeado de las tablas internas de las tarjetas. */
export function FichaTabla({ children }: { children: ReactNode }) {
  return <div className="overflow-hidden rounded-[8px] border border-[#eeede8]">{children}</div>;
}

/** La cabecera gris de una tabla interna. `cols` es el grid-template-columns. */
export function FichaTablaCabecera({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div
      className="grid border-b border-[#eeede8] bg-[#fafaf7] px-3.5 py-[7px] text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

/** Una fila de una tabla interna. */
export function FichaTablaFila({ cols, children }: { cols: string; children: ReactNode }) {
  return (
    <div
      className="grid items-center border-b border-[#f2f1ec] px-3.5 py-2.5 text-[13px] tabular-nums last:border-b-0"
      style={{ gridTemplateColumns: cols }}
    >
      {children}
    </div>
  );
}

/** La pastilla verde de la fila vigente. */
export function PastillaVigente() {
  return (
    <span className="rounded-[4px] bg-[#e6f6ef] px-1.5 py-px text-[10.5px] font-semibold text-[#047857]">
      Vigente
    </span>
  );
}
