"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FileWarning, Loader2, Truck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cargarExtraordinaria } from "@/app/(app)/op/extraordinaria/actions";
import type { DatosExtra } from "@/lib/op/extraordinaria";

type Opcion = { value: string; label: string };
const SEL = "h-9 w-full rounded-md border bg-white px-2 text-sm";

/** El formulario de la operación extraordinaria; valida en el server y lleva a la factura cargada. */
export function FormExtraordinaria({ hoy, proveedores, unidades, titulares }: {
  hoy: string; proveedores: Opcion[]; unidades: Opcion[]; titulares: string[];
}) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [d, setD] = useState<DatosExtra>({
    tipo: "Sin factura", proveedor: "", unidad: "", facturadoA: titulares.length === 1 ? titulares[0] : "", fecha: hoy,
    total: "", numero: "", concepto: "", motivo: "",
  });
  const [errores, setErrores] = useState<Partial<Record<keyof DatosExtra, string>>>({});
  const set = (k: keyof DatosExtra) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  function cargar() {
    startTransition(async () => {
      const r = await cargarExtraordinaria(d);
      setErrores(r.errores ?? {});
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      router.push(`/bandeja/${r.id}`);
    });
  }

  const tipos = [
    { k: "Sin factura", label: "Compra sin factura", nota: "En negro: siempre pide la firma de quien aprueba la unidad.", icon: FileWarning },
    { k: "Remito", label: "Remito sin factura", nota: "Se paga el remito antes de que llegue la factura. Adjuntá el remito en la ficha.", icon: Truck },
  ];

  return (
    <div className="space-y-5 rounded-lg border border-border/60 bg-[#FFFEFC] p-5">
      <div className="grid gap-3 sm:grid-cols-2">
        {tipos.map((t) => (
          <button key={t.k} type="button" onClick={() => set("tipo")(t.k)}
            className={`flex items-start gap-3 rounded-lg border p-3 text-left transition ${d.tipo === t.k ? "border-[#1B4332] bg-[#f0f6f2] ring-1 ring-[#1B4332]/20" : "border-border bg-white hover:border-[#1B4332]/40"}`}>
            <t.icon className="mt-0.5 h-5 w-5 shrink-0 text-[#1B4332]" />
            <span><span className="block text-sm font-semibold text-primary">{t.label}</span><span className="text-xs text-muted-foreground">{t.nota}</span></span>
          </button>
        ))}
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo label="Proveedor" error={errores.proveedor}>
          <select className={SEL} value={d.proveedor} onChange={(e) => set("proveedor")(e.target.value)}>
            <option value="">Elegí…</option>
            {proveedores.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </Campo>
        <Campo label="Unidad" error={errores.unidad}>
          <select className={SEL} value={d.unidad} onChange={(e) => set("unidad")(e.target.value)}>
            <option value="">Elegí…</option>
            {unidades.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
          </select>
        </Campo>
        <Campo label="A nombre de" error={errores.facturadoA}>
          <select className={SEL} value={d.facturadoA} onChange={(e) => set("facturadoA")(e.target.value)}>
            <option value="">Elegí…</option>
            {titulares.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
        </Campo>
        <Campo label="Fecha" error={errores.fecha}>
          <Input type="date" max={hoy} value={d.fecha} onChange={(e) => set("fecha")(e.target.value)} />
        </Campo>
        <Campo label="Importe" error={errores.total}>
          <Input inputMode="decimal" placeholder="Ej.: 150.000" value={d.total} onChange={(e) => set("total")(e.target.value)} />
        </Campo>
        {d.tipo === "Remito" ? (
          <Campo label="N° de remito" error={errores.numero}>
            <Input placeholder="Ej.: 0001-00012345" value={d.numero} onChange={(e) => set("numero")(e.target.value)} />
          </Campo>
        ) : (
          <Campo label="Número"><p className="flex h-9 items-center text-sm text-muted-foreground">Se asigna solo (SF-fecha-n)</p></Campo>
        )}
      </div>
      <Campo label="Qué se compró" error={errores.concepto}>
        <Input placeholder="Ej.: Maíz a granel, 44.060 kg según pesada" value={d.concepto} onChange={(e) => set("concepto")(e.target.value)} />
      </Campo>
      <Campo label="Por qué va por afuera" error={errores.motivo}>
        <Textarea rows={2} placeholder="Ej.: el productor no factura; se paga contra la pesada del secadero" value={d.motivo} onChange={(e) => set("motivo")(e.target.value)} />
      </Campo>

      <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f2f1ec] pt-4">
        <p className="text-xs text-muted-foreground">Queda pendiente: la aprueba quien aprueba la unidad, en la Bandeja.</p>
        <Button size="sm" onClick={cargar} disabled={pendiente}>
          {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileWarning className="h-4 w-4" />} Cargar operación
        </Button>
      </div>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{label}</span>
      {children}
      {error && <span className="block text-xs text-[#b91c1c]">{error}</span>}
    </label>
  );
}
