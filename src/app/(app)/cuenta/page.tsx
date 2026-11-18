import { AlertTriangle, CalendarClock, FileText, Wallet } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { CuentasLista } from "@/components/cuenta/CuentasLista";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";

export const dynamic = "force-dynamic";

/**
 * Cuentas corrientes: a quién se le debe, con lo urgente marcado. Arriba los totales;
 * abajo cada proveedor con su estado, buscador y filtros. Tocar uno abre su extracto.
 */
export default async function CuentasPage() {
  const hoy = hoyArgentina();
  const t = resumirDeuda(await listarAbiertos(), hoy);
  const n = (f: (p: (typeof t.porProveedor)[number]) => boolean) => t.porProveedor.filter(f).length;
  const tarjetas = [
    { label: "Deuda total", v: t.deuda, nota: `${t.porProveedor.length} proveedores`, icon: Wallet, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Vencido", v: t.vencido, nota: `${n((p) => Number(p.vencido) > 0)} proveedores`, icon: AlertTriangle, tono: "bg-red-50 text-red-600", rojo: true },
    { label: "Vence esta semana", v: t.semana, nota: `${n((p) => Number(p.semana) > 0)} proveedores`, icon: CalendarClock, tono: "bg-amber-50 text-amber-600" },
    { label: "Ya en OP prevista", v: t.en_op, nota: "falta que salga la plata", icon: FileText, tono: "bg-emerald-50 text-emerald-600" },
  ];
  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <div>
        <h1 className="text-2xl font-bold text-primary">Cuentas corrientes</h1>
        <p className="text-sm text-muted-foreground">
          Proveedores con facturas aprobadas sin pagar. La cuenta de cualquier proveedor se abre desde su ficha.
        </p>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tarjetas.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tono}`}><c.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <MoneyCell value={Number(c.v)} currency="ARS" decimals={0}
                className={`block truncate text-lg font-semibold ${c.rojo && Number(c.v) > 0 ? "text-red-700" : "text-primary"}`} />
              <p className="text-xs text-muted-foreground">{c.nota}</p>
            </div>
          </div>
        ))}
      </div>
      <CuentasLista filas={t.porProveedor} hoy={hoy} />
    </div>
  );
}
