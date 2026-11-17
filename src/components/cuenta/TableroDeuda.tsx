import { MoneyCell } from "@/components/shared/MoneyCell";
import type { Tablero } from "@/lib/cuenta/calculos";
import { DeudaPorProveedor } from "./DeudaPorProveedor";

/** Tablero de Inicio: cuánto se debe, cuánto vence esta semana, cuánto está vencido. */
export function TableroDeuda({ t, hoy }: { t: Tablero; hoy: string }) {
  const tarjetas = [
    { label: "Deuda total", v: t.deuda, nota: `${t.porProveedor.filter((p) => Number(p.deuda) > 0).length} proveedores` },
    { label: "A pagar esta semana", v: t.semana, nota: "vence en los próximos 7 días" },
    { label: "Vencido", v: t.vencido, nota: "ya pasó la fecha", rojo: true },
    { label: "En OP prevista", v: t.en_op, nota: "falta pagarla" },
  ];
  return (
    <section className="space-y-3">
      <h2 className="text-lg font-semibold text-primary">Tablero</h2>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {tarjetas.map((c) => (
          <div key={c.label} className="rounded-md border bg-card p-4">
            <div className="text-xs text-muted-foreground">{c.label}</div>
            <MoneyCell value={Number(c.v)} currency="ARS" decimals={2}
              className={`mt-1 block text-lg ${c.rojo && Number(c.v) > 0 ? "text-red-700" : "text-primary"}`} />
            <div className="text-xs text-muted-foreground">{c.nota}</div>
          </div>
        ))}
      </div>
      <DeudaPorProveedor filas={t.porProveedor} hoy={hoy} />
    </section>
  );
}
