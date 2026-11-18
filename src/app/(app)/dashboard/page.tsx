import Decimal from "decimal.js";
import {
  AlertTriangle, Banknote, CalendarCheck, ChartColumn, Clock, Filter, Hourglass, PieChart, ShoppingCart, Store, Warehouse, Wallet,
} from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Antiguedad, Barra, CompradoPagado, Kpis, Panel, Tiempo, type Kpi } from "@/components/dashboard/Paneles";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { listarBandeja } from "@/lib/facturas/queries";
import { listarOPsApp } from "@/lib/op/queries";
import { antiguedad, ranking, serieMensual, ultimosMeses } from "@/lib/dashboard/calculos";
import { compradoPorMes, pagadoDesde, tiempos } from "@/lib/dashboard/queries";

export const dynamic = "force-dynamic";

const MESES = 6;
const suma = (vs: (string | number)[]) => vs.reduce<Decimal>((t, v) => t.plus(v), new Decimal(0));

/**
 * Dashboard de compras (como Finanzas en alquileres): cuánto se compra y se paga, dónde
 * está la plata en el flujo (bandeja → OP → aprobación → pago), qué tan vieja es la
 * deuda y cuánto tarda cada paso. Todo derivado de cc; nada se guarda.
 */
export default async function DashboardPage() {
  const hoy = hoyArgentina();
  const meses = ultimosMeses(hoy, MESES);
  const desde = `${meses[0]}-01`;
  const [comprado, pagado, t, abiertos, bandeja, ops] = await Promise.all([
    compradoPorMes(desde), pagadoDesde(desde), tiempos(hoy), listarAbiertos(), listarBandeja(), listarOPsApp(),
  ]);

  const serie = serieMensual(meses, comprado, pagado);
  const esteMes = serie[serie.length - 1];
  const deuda = resumirDeuda(abiertos, hoy);
  const tramos = antiguedad(abiertos, hoy);
  const pctVencido = Number(deuda.deuda) > 0 ? Math.round((Number(deuda.vencido) / Number(deuda.deuda)) * 100) : 0;

  // Dónde está la plata hoy, de la bandeja al pago.
  const delEstado = (...e: string[]) => ops.filter((o) => e.includes(o.estado));
  const totalOps = (lista: typeof ops) => suma(lista.map((o) => o.total_imputado));
  const enApp = delEstado("En armado", "A aprobar", "Observada", "Bloqueada", "Autorizada");
  const enClickUp = Decimal.max(0, new Decimal(deuda.en_op).minus(totalOps(enApp)));
  const libre = suma(abiertos.map((a) => a.libre));
  const embudo: { label: string; valor: string; sub: string; href: string; color: string }[] = [
    { label: "En la bandeja, sin aprobar", valor: suma(bandeja.map((b) => b.total)).toFixed(2), sub: `${bandeja.length} facturas`, href: "/bandeja", color: "bg-[#a3a3a3]" },
    { label: "Aprobadas, sin OP", valor: libre.toFixed(2), sub: `${abiertos.filter((a) => Number(a.libre) > 0.5).length} facturas`, href: "/op/nueva", color: "bg-[#B8960C]" },
    { label: "OP en armado", valor: totalOps(delEstado("En armado")).toFixed(2), sub: `${delEstado("En armado").length} OP`, href: "/op", color: "bg-[#B8960C]" },
    { label: "OP a aprobar", valor: totalOps(delEstado("A aprobar")).toFixed(2), sub: `${delEstado("A aprobar").length} OP`, href: "/aprobar", color: "bg-[#f59e0b]" },
    { label: "OP frenadas", valor: totalOps(delEstado("Observada", "Bloqueada")).toFixed(2), sub: `${delEstado("Observada", "Bloqueada").length} OP`, href: "/aprobar", color: "bg-[#ea580c]" },
    { label: "Autorizadas, para pagar", valor: totalOps(delEstado("Autorizada")).toFixed(2), sub: `${delEstado("Autorizada").length} OP`, href: "/pagos", color: "bg-[#1B4332]" },
    { label: "En OP de ClickUp", valor: enClickUp.toFixed(2), sub: "se pagan allá", href: "/op", color: "bg-[#737373]" },
  ];
  const maxEmbudo = Math.max(...embudo.map((e) => Number(e.valor)));

  const porCategoria = ranking(pagado.map((p) => ({ clave: p.categoria, total: p.total })), 6);
  const porUnidad = ranking(pagado.map((p) => ({ clave: p.unidad, total: p.total })), 6);
  const porProveedor = ranking(pagado.map((p) => ({ clave: p.proveedor, total: p.total })), 6);
  const maxDe = (l: { total: string }[]) => Math.max(0, ...l.map((x) => Number(x.total)));
  const totalPagado = suma(pagado.map((p) => p.total));

  const kpis: Kpi[] = [
    { label: "Comprado este mes", v: <MoneyCell value={Number(esteMes.comprado)} currency="ARS" decimals={0} />, sub: "facturas no anuladas",
      icon: ShoppingCart, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Pagado este mes", v: <MoneyCell value={Number(esteMes.pagado)} currency="ARS" decimals={0} />, sub: "por salida de caja",
      icon: Banknote, tono: "bg-emerald-50 text-emerald-600" },
    { label: "Deuda", v: <MoneyCell value={Number(deuda.deuda)} currency="ARS" decimals={0} />, sub: `${abiertos.length} facturas aprobadas`,
      icon: Wallet, tono: "bg-[#B8960C]/10 text-[#B8960C]" },
    { label: "Vencido", v: <MoneyCell value={Number(deuda.vencido)} currency="ARS" decimals={0} className={Number(deuda.vencido) > 0 ? "text-red-700" : ""} />,
      sub: `${pctVencido} % de la deuda`, icon: AlertTriangle, tono: "bg-red-50 text-red-600" },
    { label: "Pagado en término", v: t.en_termino == null ? "—" : `${t.en_termino} %`,
      sub: t.atraso != null && t.atraso > 0 ? `mediana ${t.atraso} días tarde` : "últimos 90 días",
      icon: CalendarCheck, tono: (t.en_termino ?? 100) < 60 ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600" },
  ];

  return (
    <div className="mx-auto max-w-[1400px] space-y-6 px-8 py-6">
      <div className="space-y-1">
        <h1 className="text-2xl font-semibold tracking-tight text-[#1B4332]">Dashboard</h1>
        <p className="text-sm text-muted-foreground">Compras y pagos de West Desarrolladora · últimos {MESES} meses</p>
      </div>

      <Kpis kpis={kpis} />

      <Panel icon={ChartColumn} titulo="Comprado contra pagado" extra={<>pagado en el período {<MoneyCell value={totalPagado.toNumber()} currency="ARS" decimals={0} />}</>}>
        <CompradoPagado serie={serie} hoy={hoy} />
      </Panel>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        <Panel icon={Filter} titulo="Dónde está la plata" extra="hoy">
          <div className="space-y-2.5">
            {embudo.map((e) => <Barra key={e.label} label={e.label} valor={e.valor} max={maxEmbudo} sub={e.sub} color={e.color} href={e.href} />)}
          </div>
        </Panel>
        <Panel icon={Hourglass} titulo="Antigüedad de la deuda" extra={<>total <MoneyCell value={Number(deuda.deuda)} currency="ARS" decimals={0} /></>}>
          <Antiguedad tramos={tramos} />
        </Panel>
        <Panel icon={Clock} titulo="Cuánto tarda cada paso" extra="mediana, 90 días">
          <Tiempo label="De la factura a la carga" dias={t.carga} nota="fecha de la factura → la carga el plomero o Claude" alerta={(t.carga ?? 0) > 7} />
          <Tiempo label="De la carga al pago" dias={t.carga_a_pago} nota="entra a la base → sale la plata" />
          <Tiempo label="De la factura al pago" dias={t.factura_a_pago} nota={`${t.pagadas} facturas pagadas`} />
          <Tiempo label="Atraso contra el vencimiento" dias={t.atraso} nota="positivo: se pagó después de vencer" alerta={(t.atraso ?? 0) > 0} />
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
        {([
          ["Pagado por categoría", PieChart, porCategoria],
          ["Pagado por unidad", Warehouse, porUnidad],
          ["Proveedores a los que más se pagó", Store, porProveedor],
        ] as const).map(([titulo, icon, lista]) => (
          <Panel key={titulo} icon={icon} titulo={titulo} extra={`${MESES} meses`}>
            <div className="space-y-2.5">
              {lista.length === 0 ? <p className="text-xs text-muted-foreground">Sin pagos en el período.</p>
                : lista.map((x) => <Barra key={x.clave} label={x.clave} valor={x.total} max={maxDe(lista)} />)}
            </div>
          </Panel>
        ))}
      </div>
    </div>
  );
}
