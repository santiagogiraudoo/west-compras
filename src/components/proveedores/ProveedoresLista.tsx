"use client";

import { useState } from "react";
import Link from "next/link";
import { BookOpen, CheckCircle, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";

export interface FilaProveedor {
  codigo: string;
  razon_social: string;
  cuit: string | null;
  rubro: string | null;
  condicion_pago: string | null;
  faltan: string[];
  comprado_90: string;
  pagado_90: string;
  facturas_90: number;
  ultima: string | null;
  dias_pago: number | null;
  plazo: number | null;
  deuda: string;
  vencido: string;
}

type Filtro = "todos" | "incompletos" | "deuda" | "vencido" | "quietos";
type Orden = "compra" | "deuda" | "reciente" | "az";
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";
const $ = (v: string, className?: string) => <MoneyCell value={Number(v)} currency="ARS" decimals={0} className={className} />;

/**
 * Proveedores como panel: quién es, si tiene el alta completa para pagarle, cuánto se le
 * compra y paga, cuánto se le debe y cuánto se tarda de verdad en pagarle contra lo
 * pactado. Buscador, filtros y orden, como en Central de pagos.
 */
export function ProveedoresLista({ filas, hoy }: { filas: FilaProveedor[]; hoy: string }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const [orden, setOrden] = useState<Orden>("compra");
  const hace90 = new Date(Date.parse(`${hoy}T12:00:00Z`) - 90 * 86_400_000).toISOString().slice(0, 10);
  const de: Record<Filtro, (f: FilaProveedor) => boolean> = {
    todos: () => true,
    incompletos: (f) => f.faltan.length > 0,
    deuda: (f) => Number(f.deuda) > 0.5,
    vencido: (f) => Number(f.vencido) > 0.5,
    quietos: (f) => !f.ultima || f.ultima < hace90,
  };
  const busca = q.trim().toLowerCase();
  const vistas = filas
    .filter((f) => de[filtro](f) && (!busca || [f.razon_social, f.cuit ?? "", f.rubro ?? "", f.codigo].some((x) => x.toLowerCase().includes(busca))))
    .sort((a, b) => orden === "az" ? a.razon_social.localeCompare(b.razon_social)
      : orden === "deuda" ? Number(b.deuda) - Number(a.deuda)
      : orden === "reciente" ? (b.ultima ?? "").localeCompare(a.ultima ?? "")
      : Number(b.comprado_90) - Number(a.comprado_90));
  const chips: { k: Filtro; label: string }[] = [
    { k: "todos", label: "Todos" }, { k: "incompletos", label: "Alta incompleta" }, { k: "deuda", label: "Con deuda" },
    { k: "vencido", label: "Con vencido" }, { k: "quietos", label: "Sin compras en 90 días" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar nombre, CUIT o rubro" className="h-8 pl-8 text-sm" />
        </div>
        {chips.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltro(c.k)}
            className={`h-8 rounded-full border px-3 text-[12.5px] font-medium transition ${
              filtro === c.k ? "border-[#1B4332] bg-[#1B4332] text-white" : "border-border bg-white text-[#525252] hover:border-[#1B4332]/40"
            }`}>
            {c.label} <span className={filtro === c.k ? "text-white/70" : "text-muted-foreground"}>{filas.filter(de[c.k]).length}</span>
          </button>
        ))}
        <label className="ml-auto flex items-center gap-1.5 text-xs text-muted-foreground">
          Ordenar
          <select value={orden} onChange={(e) => setOrden(e.target.value as Orden)} className="h-8 rounded-md border bg-white px-2 text-[12.5px] text-foreground">
            <option value="compra">Más compra</option>
            <option value="deuda">Más deuda</option>
            <option value="reciente">Más reciente</option>
            <option value="az">A–Z</option>
          </select>
        </label>
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full min-w-[1040px] text-[13px]">
          <thead className="border-b bg-[#fafaf7]">
            <tr>
              <th className={TH}>Proveedor</th><th className={TH}>Alta</th><th className={TH}>Condición</th>
              <th className={`${TH} text-right`}>Comprado 90 d</th><th className={`${TH} text-right`}>Pagado 90 d</th>
              <th className={`${TH} text-right`}>Deuda</th><th className={TH}>Última</th><th className={TH}>Se le paga en</th><th className="w-10" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2f1ec]">
            {vistas.length === 0 && <tr><td colSpan={9} className="p-10 text-center text-sm text-muted-foreground">Ningún proveedor con ese filtro.</td></tr>}
            {vistas.map((f) => (
              <tr key={f.codigo} className="hover:bg-[#fafaf7]">
                <td className="px-3 py-2.5">
                  <Link href={`/proveedores/${f.codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">{f.razon_social}</Link>
                  <span className="block text-[11.5px] text-muted-foreground">{[f.rubro, f.cuit].filter(Boolean).join(" · ") || f.codigo}</span>
                </td>
                <td className="px-3 py-2.5">
                  {f.faltan.length === 0
                    ? <StatusPill tone="success" icon={CheckCircle} className="whitespace-nowrap">Completa</StatusPill>
                    : <span title={`Falta: ${f.faltan.join(", ")}`}><StatusPill tone="amber" icon={TriangleAlert} className="whitespace-nowrap">Faltan {f.faltan.length}</StatusPill></span>}
                </td>
                <td className="px-3 py-2.5">{f.condicion_pago ?? <span className="text-[#92400e]">sin cargar</span>}</td>
                <td className="px-3 py-2.5 text-right">
                  {Number(f.comprado_90) ? $(f.comprado_90, "font-medium") : <span className="text-muted-foreground">—</span>}
                  {f.facturas_90 > 0 && <span className="block text-[11px] text-muted-foreground">{f.facturas_90} facturas</span>}
                </td>
                <td className="px-3 py-2.5 text-right">{Number(f.pagado_90) ? $(f.pagado_90) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5 text-right">
                  {Number(f.deuda) > 0.5 ? $(f.deuda, "font-medium") : <span className="text-muted-foreground">—</span>}
                  {Number(f.vencido) > 0.5 && <span className="block text-[11px] text-red-700">{$(f.vencido)} vencido</span>}
                </td>
                <td className="px-3 py-2.5 whitespace-nowrap">{f.ultima ? formatDate(f.ultima) : <span className="text-muted-foreground">—</span>}</td>
                <td className="px-3 py-2.5"><DiasPago dias={f.dias_pago} plazo={f.plazo} /></td>
                <td className="px-2 py-2.5">
                  <Link href={`/cuenta/${f.codigo}`} title="Cuenta corriente" className="flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground hover:bg-[#f0f6f2] hover:text-primary">
                    <BookOpen className="h-4 w-4" />
                  </Link>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** Días reales de pago contra el plazo pactado: verde si se cumple, rojo si se paga después. */
function DiasPago({ dias, plazo }: { dias: number | null; plazo: number | null }) {
  if (dias == null) return <span className="text-muted-foreground">—</span>;
  const tarde = plazo != null && plazo > 0 && dias > plazo;
  return (
    <span className="whitespace-nowrap">
      <span className={`font-medium ${tarde ? "text-[#b91c1c]" : "text-primary"}`}>{dias} días</span>
      <span className="block text-[11px] text-muted-foreground">{plazo ? `pactado ${plazo}` : "contado o sin plazo"}</span>
    </span>
  );
}
