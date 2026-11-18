"use client";

import { useState } from "react";
import Link from "next/link";
import {
  AlertTriangle, ArrowRight, Banknote, CalendarClock, CheckCircle, ClipboardCheck, FilePlus, FileWarning, Wrench, type LucideIcon,
} from "lucide-react";
import type { Pendiente } from "@/lib/pendientes";

type Pestana = "hacer" | "alertas" | "datos";

/** Cuántas se ven de entrada; el resto con "Ver todas". */
const PRIMERAS = 6;

const PESTANAS: { k: Pestana; label: string; nota: string; de: (p: Pendiente) => boolean }[] = [
  { k: "hacer", label: "Para hacer", nota: "OP y facturas que esperan algo de la app", de: (p) => p.origen === "op" },
  { k: "alertas", label: "Alertas", nota: "Lo que marca la base: posibles dobles pagos, OP sin pagar, notas de crédito", de: (p) => p.origen === "alerta" },
  { k: "datos", label: "Datos a corregir", nota: "Faltan datos de proveedores o facturas", de: (p) => p.origen === "calidad" },
];

/** A dónde lleva cada cosa y con qué botón. */
function accion(p: Pendiente): { href: string; label: string } | null {
  const h = p.href;
  if (h?.startsWith("/op/nueva")) return { href: h, label: "Armar OP" };
  if (h?.includes("paso=aprobar")) return { href: h, label: "Ir a aprobar" };
  if (h?.includes("paso=pagar")) return { href: h, label: "Ir a pagar" };
  if (h) return { href: h, label: "Ver OP" };
  // Un problema de una factura se corrige en la factura: se la busca en la bandeja.
  if (p.origen === "calidad" && /factura|pdf/i.test(p.tipo) && !/aprobada/i.test(p.tipo) && p.ref) return { href: `/bandeja?q=${encodeURIComponent(p.ref)}`, label: "Ver factura" };
  if (p.codigo?.startsWith("PR-")) {
    return p.origen === "calidad" ? (/aprobada/i.test(p.tipo) ? { href: `/cuenta/${p.codigo}`, label: "Ver cuenta" } : { href: `/proveedores/${p.codigo}`, label: "Corregir" }) : { href: `/cuenta/${p.codigo}`, label: "Ver cuenta" };
  }
  return null;
}

/** El icono y su color dicen de qué se trata sin leer. */
function icono(p: Pendiente): { icon: LucideIcon; tono: string } {
  if (p.href?.startsWith("/op/nueva")) return { icon: FilePlus, tono: "bg-[#B8960C]/10 text-[#B8960C]" };
  if (p.href?.includes("paso=aprobar")) return { icon: ClipboardCheck, tono: p.tipo.includes("observada") || p.tipo.includes("bloqueada") ? "bg-orange-50 text-orange-600" : "bg-amber-50 text-amber-600" };
  if (p.href?.includes("paso=pagar")) return { icon: Banknote, tono: "bg-emerald-50 text-emerald-600" };
  if (p.origen === "op") return { icon: CalendarClock, tono: "bg-[#f5f5f0] text-[#737373]" };
  if (p.origen === "alerta") {
    return p.severidad === "alta" ? { icon: AlertTriangle, tono: "bg-red-50 text-red-600" }
      : p.severidad === "media" ? { icon: FileWarning, tono: "bg-amber-50 text-amber-600" }
      : { icon: FileWarning, tono: "bg-[#f5f5f0] text-[#737373]" };
  }
  return { icon: Wrench, tono: "bg-[#f5f5f0] text-[#737373]" };
}

/**
 * "Lo que hay que hacer" del Inicio: tres pestañas (para hacer, alertas, datos), cada cosa
 * en una fila con su icono, el proveedor, qué pasa y un botón que lleva a resolverla.
 * Reemplaza los grupos desplegables, que escondían cosas y no decían qué tocar.
 */
export function QueHacer({ pendientes }: { pendientes: Pendiente[] }) {
  const conCosas = PESTANAS.find((t) => pendientes.some(t.de))?.k ?? "hacer";
  const [pestana, setPestana] = useState<Pestana>(conCosas);
  const [todas, setTodas] = useState(false);
  const actual = PESTANAS.find((t) => t.k === pestana)!;
  const lista = pendientes.filter(actual.de);
  const vistas = todas ? lista : lista.slice(0, PRIMERAS);

  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <h2 className="text-lg font-semibold text-primary">Lo que hay que hacer</h2>
        <div className="flex gap-1 rounded-lg border border-border/60 bg-[#FFFEFC] p-1" role="tablist">
          {PESTANAS.map((t) => {
            const n = pendientes.filter(t.de).length;
            const alta = t.k === "alertas" && pendientes.some((p) => t.de(p) && p.severidad === "alta");
            return (
              <button key={t.k} type="button" role="tab" aria-selected={pestana === t.k}
                onClick={() => { setPestana(t.k); setTodas(false); }}
                className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] font-medium transition ${
                  pestana === t.k ? "bg-[#1B4332] text-white" : "text-[#525252] hover:bg-[#f5f5f0]"
                }`}>
                {t.label}
                <span className={`rounded-full px-1.5 text-[11px] leading-[18px] ${
                  alta ? "bg-[#dc2626] text-white" : pestana === t.k ? "bg-white/15" : "bg-[#f0efe9] text-[#737373]"
                }`}>{n}</span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="overflow-hidden rounded-lg border border-border/60 bg-white">
        <p className="border-b border-[#f2f1ec] bg-[#fafaf7] px-4 py-2 text-xs text-muted-foreground">{actual.nota}</p>
        {lista.length === 0 ? (
          <div className="flex items-center justify-center gap-2 p-10 text-sm text-muted-foreground">
            <CheckCircle className="h-4 w-4 text-emerald-600" /> Nada por acá. ¡Bien ahí!
          </div>
        ) : (
          <ul className="divide-y divide-[#f2f1ec]">
            {vistas.map((p, i) => {
              const a = accion(p);
              const { icon: Icon, tono } = icono(p);
              return (
                <li key={i} className="flex items-center gap-3 px-4 py-3 hover:bg-[#fafaf7]">
                  <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-lg ${tono}`}><Icon className="h-[18px] w-[18px]" /></div>
                  <div className="min-w-0 flex-1">
                    <p className="flex flex-wrap items-baseline gap-x-2 text-[13.5px]">
                      <span className="font-semibold text-foreground">{p.proveedor ?? "General"}</span>
                      <span className="text-[11.5px] font-medium text-[#8a8a85]">{p.tipo}</span>
                    </p>
                    {p.detalle && <p className="line-clamp-2 text-[12.5px] text-[#525252]">{p.detalle}</p>}
                  </div>
                  {a && (
                    <Link href={a.href}
                      className="group inline-flex h-8 shrink-0 items-center gap-1.5 rounded-md border border-border bg-white px-3 text-[12.5px] font-medium text-primary transition hover:border-[#1B4332] hover:bg-[#1B4332] hover:text-white">
                      {a.label} <ArrowRight className="h-3.5 w-3.5 transition group-hover:translate-x-0.5" />
                    </Link>
                  )}
                </li>
              );
            })}
          </ul>
        )}
        {lista.length > PRIMERAS && (
          <button type="button" onClick={() => setTodas((v) => !v)}
            className="w-full border-t border-[#f2f1ec] py-2.5 text-[12.5px] font-medium text-primary hover:bg-[#fafaf7]">
            {todas ? "Ver menos" : `Ver las ${lista.length}`}
          </button>
        )}
      </div>
    </section>
  );
}
