import { AlertTriangle, CalendarClock, FileText, Wallet } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import type { Tablero } from "@/lib/cuenta/calculos";
import { DeudaPorProveedor } from "./DeudaPorProveedor";

/** Tablero de Inicio: cuánto se debe, cuánto vence esta semana, cuánto está vencido. */
export function TableroDeuda({ t, hoy }: { t: Tablero; hoy: string }) {
  const tarjetas = [
    { label: "Deuda total", v: t.deuda, nota: `${t.porProveedor.filter((p) => Number(p.deuda) > 0).length} proveedores`,
      icon: Wallet, iconBg: "bg-[#B8960C]/10", iconColor: "text-[#B8960C]" },
    { label: "A pagar esta semana", v: t.semana, nota: "vence en los próximos 7 días",
      icon: CalendarClock, iconBg: "bg-amber-50", iconColor: "text-amber-600" },
    { label: "Vencido", v: t.vencido, nota: "ya pasó la fecha", rojo: true,
      icon: AlertTriangle, iconBg: "bg-red-50", iconColor: "text-red-600" },
    { label: "En OP prevista", v: t.en_op, nota: "falta pagarla",
      icon: FileText, iconBg: "bg-emerald-50", iconColor: "text-emerald-600" },
  ];
  return (
    <section className="space-y-4">
      <h2 className="text-lg font-semibold text-primary">Tablero</h2>
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
        {tarjetas.map((c) => (
          <div key={c.label} className="border border-border/60 bg-[#FFFEFC] rounded-lg p-4 flex items-start gap-3">
            <div className={`flex items-center justify-center h-10 w-10 rounded-lg shrink-0 ${c.iconBg}`}>
              <c.icon className={`h-5 w-5 ${c.iconColor}`} />
            </div>
            <div className="min-w-0">
              <p className="text-xs text-muted-foreground font-medium">{c.label}</p>
              <MoneyCell value={Number(c.v)} currency="ARS" decimals={2}
                className={`block text-lg font-semibold truncate ${c.rojo && Number(c.v) > 0 ? "text-red-700" : "text-primary"}`} />
              <p className="text-xs text-muted-foreground">{c.nota}</p>
            </div>
          </div>
        ))}
      </div>
      <DeudaPorProveedor filas={t.porProveedor} hoy={hoy} />
    </section>
  );
}
