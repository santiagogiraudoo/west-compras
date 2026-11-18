"use client";

import { useState } from "react";
import Link from "next/link";
import { CalendarClock, CheckCircle, FilePlus, Search, TriangleAlert } from "lucide-react";
import { Input } from "@/components/ui/input";
import { StatusPill } from "@/components/shared/StatusPill";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import type { DeudaProveedor } from "@/lib/cuenta/calculos";

type Filtro = "todos" | "vencido" | "semana" | "libre";
const TH = "px-3 py-2 text-left text-xs font-semibold uppercase tracking-wide text-[#B8960C]";

/** Lo que falta poner en una OP: la deuda menos lo que ya está en OP prevista. */
const libreDe = (p: DeudaProveedor) => Number(p.deuda) - Number(p.en_op);

/**
 * Cuentas corrientes con buscador y filtros (vencido, vence esta semana, sin OP). Cada
 * proveedor lleva su estado en una pastilla y, si tiene facturas libres, el acceso a
 * armarle la OP.
 */
export function CuentasLista({ filas, hoy }: { filas: DeudaProveedor[]; hoy: string }) {
  const [q, setQ] = useState("");
  const [filtro, setFiltro] = useState<Filtro>("todos");
  const cuenta: Record<Filtro, number> = {
    todos: filas.length,
    vencido: filas.filter((p) => Number(p.vencido) > 0).length,
    semana: filas.filter((p) => Number(p.semana) > 0).length,
    libre: filas.filter((p) => libreDe(p) > 0.5).length,
  };
  const vistas = filas.filter((p) =>
    (!q || p.razon_social.toLowerCase().includes(q.toLowerCase()))
    && (filtro === "todos" || (filtro === "vencido" ? Number(p.vencido) > 0 : filtro === "semana" ? Number(p.semana) > 0 : libreDe(p) > 0.5)));

  const chips: { k: Filtro; label: string }[] = [
    { k: "todos", label: "Todos" }, { k: "vencido", label: "Con vencido" }, { k: "semana", label: "Vence esta semana" }, { k: "libre", label: "Sin OP" },
  ];

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative w-full max-w-xs">
          <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Buscar proveedor" className="h-8 pl-8 text-sm" />
        </div>
        {chips.map((c) => (
          <button key={c.k} type="button" onClick={() => setFiltro(c.k)}
            className={`h-8 rounded-full border px-3 text-[12.5px] font-medium transition ${
              filtro === c.k ? "border-[#1B4332] bg-[#1B4332] text-white" : "border-border bg-white text-[#525252] hover:border-[#1B4332]/40"
            }`}>
            {c.label} <span className={filtro === c.k ? "text-white/70" : "text-muted-foreground"}>{cuenta[c.k]}</span>
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-md border bg-white">
        <table className="w-full min-w-[820px] text-[13px]">
          <thead className="border-b bg-[#fafaf7]">
            <tr>
              <th className={TH}>Proveedor</th>
              <th className={TH}>Estado</th>
              <th className={`${TH} text-right`}>Deuda</th>
              <th className={`${TH} text-right`}>Vencido</th>
              <th className={`${TH} text-right`}>En OP</th>
              <th className={TH}>Próximo venc.</th>
              <th className="w-28" />
            </tr>
          </thead>
          <tbody className="divide-y divide-[#f2f1ec]">
            {vistas.length === 0 && (
              <tr><td colSpan={7} className="p-10 text-center text-sm text-muted-foreground">Nadie con ese filtro.</td></tr>
            )}
            {vistas.map((p) => {
              const libre = libreDe(p);
              return (
                <tr key={p.codigo} className="hover:bg-[#fafaf7]">
                  <td className="px-3 py-2.5">
                    <Link href={`/cuenta/${p.codigo}`} className="font-medium text-primary underline-offset-2 hover:underline">{p.razon_social}</Link>
                  </td>
                  <td className="px-3 py-2.5"><Estado p={p} /></td>
                  <td className="px-3 py-2.5 text-right font-medium"><MoneyCell value={Number(p.deuda)} currency="ARS" decimals={0} /></td>
                  <td className="px-3 py-2.5 text-right">
                    {Number(p.vencido) > 0 ? <MoneyCell value={Number(p.vencido)} currency="ARS" decimals={0} className="text-red-700" /> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="px-3 py-2.5 text-right">
                    {Number(p.en_op) > 0 ? <MoneyCell value={Number(p.en_op)} currency="ARS" decimals={0} className="text-muted-foreground" /> : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className={`px-3 py-2.5 ${p.proximo_vencimiento && p.proximo_vencimiento < hoy ? "text-red-700" : ""}`}>{formatDate(p.proximo_vencimiento)}</td>
                  <td className="px-3 py-2.5 text-right">
                    {libre > 0.5 && (
                      <Link href={`/op/nueva?proveedor=${p.codigo}`} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs font-medium text-primary hover:bg-[#f0f6f2]">
                        <FilePlus className="h-3.5 w-3.5" /> Armar OP
                      </Link>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/** El estado del proveedor en una palabra: lo más urgente manda. */
function Estado({ p }: { p: DeudaProveedor }) {
  const libre = libreDe(p);
  if (Number(p.vencido) > 0 && libre > 0.5) return <StatusPill tone="red" icon={TriangleAlert} size="sm" className="whitespace-nowrap">Vencido sin OP</StatusPill>;
  if (Number(p.vencido) > 0) return <StatusPill tone="orange" icon={TriangleAlert} size="sm" className="whitespace-nowrap">Vencido, en OP</StatusPill>;
  if (Number(p.semana) > 0) return <StatusPill tone="amber" icon={CalendarClock} size="sm" className="whitespace-nowrap">Vence esta semana</StatusPill>;
  if (libre <= 0.5) return <StatusPill tone="success" icon={CheckCircle} size="sm" className="whitespace-nowrap">Todo en OP</StatusPill>;
  return <StatusPill tone="neutral" size="sm" className="whitespace-nowrap">Al día</StatusPill>;
}
