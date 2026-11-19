import Link from "next/link";
import Decimal from "decimal.js";
import { CheckCircle, Clock, Plus, ShoppingCart, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { ProveedoresLista, type FilaProveedor } from "@/components/proveedores/ProveedoresLista";
import { prisma } from "@/lib/prisma";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { movimientoProveedores } from "@/lib/proveedores/queries";

export const dynamic = "force-dynamic";

/**
 * Proveedores: el alta (lo que falta para poder pagarles, decisión 17/11) y el
 * movimiento con West (compras, pagos, deuda, cuánto se tarda en pagarles). Tocar uno
 * abre su ficha para completarla; el libro abre su cuenta corriente.
 */
export default async function ProveedoresPage() {
  const hoy = hoyArgentina();
  const [proveedores, movimiento, abiertos] = await Promise.all([
    prisma.proveedor.findMany({ where: { activo: true }, orderBy: { razon_social: "asc" } }),
    movimientoProveedores(hoy),
    listarAbiertos(),
  ]);
  const mov = new Map(movimiento.map((m) => [m.codigo, m]));
  const deuda = new Map(resumirDeuda(abiertos, hoy).porProveedor.map((d) => [d.codigo, d]));
  const filas: FilaProveedor[] = proveedores.map((p) => {
    const m = mov.get(p.codigo);
    const d = deuda.get(p.codigo);
    return {
      codigo: p.codigo, razon_social: p.razon_social, cuit: p.cuit, rubro: p.rubro, condicion_pago: p.condicion_pago?.trim() || null,
      faltan: faltantesProveedor(p), comprado_90: m?.comprado_90 ?? "0", pagado_90: m?.pagado_90 ?? "0", facturas_90: m?.facturas_90 ?? 0,
      ultima: m?.ultima ?? null, dias_pago: m?.dias_pago ?? null, plazo: m?.plazo ?? null, deuda: d?.deuda ?? "0", vencido: d?.vencido ?? "0",
    };
  });

  const completos = filas.filter((f) => f.faltan.length === 0).length;
  const activos = filas.filter((f) => Number(f.comprado_90) > 0);
  const comprado = activos.reduce((t, f) => t.plus(f.comprado_90), new Decimal(0));
  const top5 = [...activos].sort((a, b) => Number(b.comprado_90) - Number(a.comprado_90)).slice(0, 5).reduce((t, f) => t.plus(f.comprado_90), new Decimal(0));
  const conDias = activos.filter((f) => f.dias_pago != null);
  const tarjetas = [
    { label: "Con compras en 90 días", v: String(activos.length), sub: <>por <MoneyCell value={comprado.toNumber()} currency="ARS" decimals={0} /></>, icon: ShoppingCart, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Alta completa", v: `${completos} de ${filas.length}`, sub: "sin el alta no se les puede pagar desde la app", icon: CheckCircle,
      tono: completos < filas.length ? "bg-amber-50 text-amber-600" : "bg-emerald-50 text-emerald-600" },
    { label: "Concentración", v: comprado.isZero() ? "—" : `${top5.div(comprado).times(100).toDecimalPlaces(0).toNumber()} %`, sub: "de lo comprado va a los 5 primeros", icon: Users, tono: "bg-[#1B4332]/10 text-[#1B4332]" },
    { label: "Se les paga en", v: conDias.length ? `${Math.round(conDias.reduce((t, f) => t + f.dias_pago!, 0) / conDias.length)} días` : "—",
      sub: "promedio, de la factura al pago", icon: Clock, tono: "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-primary">Proveedores</h1>
          <p className="text-sm text-muted-foreground">El alta para poder pagarles y cómo viene la relación con cada uno.</p>
        </div>
        <Button size="sm" asChild>
          <Link href="/proveedores/nuevo"><Plus className="h-4 w-4" /> Nuevo proveedor</Link>
        </Button>
      </div>
      <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
        {tarjetas.map((c) => (
          <div key={c.label} className="flex items-start gap-3 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
            <div className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-lg ${c.tono}`}><c.icon className="h-5 w-5" /></div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-muted-foreground">{c.label}</p>
              <p className="truncate text-lg font-semibold text-primary">{c.v}</p>
              <p className="text-xs text-muted-foreground">{c.sub}</p>
            </div>
          </div>
        ))}
      </div>
      <ProveedoresLista filas={filas} hoy={hoy} />
    </div>
  );
}
