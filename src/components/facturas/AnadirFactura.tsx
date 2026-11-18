"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { toast } from "sonner";
import { CheckCircle, FileUp, Loader2, Plus, Sparkles, Trash2, TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { guardarFacturaNueva, leerFacturaSubida, type DatosFactura } from "@/app/(app)/bandeja/nueva/actions";
import { tipoComprobante, numeroComprobante } from "@/lib/facturas/lectura";

type Opcion = { value: string; label: string };
const SEL = "h-9 w-full rounded-md border bg-white px-2 text-sm";
const TIPOS = ["Factura A", "Factura B", "Factura C", "Nota de Credito A", "Nota de Credito B", "Nota de Credito C", "Nota de Debito A"];
const VACIO: DatosFactura = {
  proveedor: "", tipo: "Factura A", numero: "", fecha: "", vencimiento: "", unidad: "", facturadoA: "", categoria: "",
  neto: "", iva: "", percepciones: "", total: "", descripcion: "", dudas: "", items: [],
};

/**
 * Añadir factura en dos pasos: 1) subir y leer con IA (o completar a mano si no hay IA);
 * 2) revisar lo leído, completar lo que falta y cargarla pendiente.
 */
export function AnadirFactura({ hoy, conIA, proveedores, unidades, titulares, categorias }: {
  hoy: string; conIA: boolean; proveedores: Opcion[]; unidades: Opcion[]; titulares: string[]; categorias: string[];
}) {
  const router = useRouter();
  const [archivo, setArchivo] = useState<File | null>(null);
  const [vista, setVista] = useState<string | null>(null);
  const [d, setD] = useState<DatosFactura>({ ...VACIO, fecha: hoy, facturadoA: titulares.length === 1 ? titulares[0] : "" });
  const [avisos, setAvisos] = useState<string[] | null>(null);
  const [repetida, setRepetida] = useState(false);
  const [leyendo, startLeer] = useTransition();
  const [guardando, startGuardar] = useTransition();
  const set = (k: keyof DatosFactura) => (v: string) => setD((x) => ({ ...x, [k]: v }));

  function elegir(f: File | null) {
    setArchivo(f);
    setAvisos(null);
    setRepetida(false);
    setVista(f && f.type.startsWith("image/") ? URL.createObjectURL(f) : null);
    if (!f) return;
    startLeer(async () => {
      const fd = new FormData();
      fd.set("archivo", f);
      const r = await leerFacturaSubida(fd);
      if (!r.ok) { toast.error(r.mensaje); return; }
      if (r.yaSubido) { toast.error("Este archivo ya se cargó: te llevo a esa factura."); router.push(`/bandeja/${r.yaSubido}`); return; }
      if (!r.lectura || !r.analisis) { setAvisos([r.mensaje ?? "Completá los datos a mano."]); return; }
      const l = r.lectura;
      setD((x) => ({
        ...x,
        proveedor: r.analisis!.proveedor ?? x.proveedor,
        tipo: tipoComprobante(l.tipo, l.letra),
        numero: numeroComprobante(l.punto_venta, l.numero) ?? x.numero,
        fecha: l.fecha ?? x.fecha, vencimiento: l.vencimiento ?? "",
        neto: l.neto ?? "", iva: l.iva ?? "", percepciones: l.percepciones ?? "0", total: l.total ?? "",
        descripcion: l.items.slice(0, 3).map((it) => it.descripcion).join("; ") + (l.items.length > 3 ? `; y ${l.items.length - 3} más` : ""),
        dudas: l.dudas.join("; "),
        items: l.items,
      }));
      setAvisos(r.analisis.avisos);
      setRepetida(r.analisis.repetida);
    });
  }

  function guardar() {
    if (!archivo) { toast.error("Subí la foto o el PDF de la factura."); return; }
    startGuardar(async () => {
      const fd = new FormData();
      fd.set("archivo", archivo);
      fd.set("datos", JSON.stringify(d));
      const r = await guardarFacturaNueva(fd);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      router.push(`/bandeja/${r.id}`);
    });
  }

  // Lo que todavía falta, mirando el formulario (además de lo que avisó la lectura).
  const faltan = [
    !d.proveedor && "proveedor", !d.numero && "número", !d.unidad && "unidad", !d.facturadoA && "a nombre de quién", !d.total && "total",
  ].filter(Boolean) as string[];

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
      {/* 1. El archivo */}
      <section className="space-y-3 self-start rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
        <p className="text-sm font-semibold text-primary">1 · La factura</p>
        <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-[#d6d3c8] bg-white p-6 text-center hover:border-[#1B4332]/50">
          <FileUp className="h-7 w-7 text-[#B8960C]" />
          <span className="text-sm font-medium">{archivo ? archivo.name : "Elegí la foto o el PDF"}</span>
          <span className="text-xs text-muted-foreground">PDF, JPG, PNG o WEBP · hasta 10 MB</span>
          <input type="file" accept="application/pdf,image/jpeg,image/png,image/webp" className="hidden"
            onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
        </label>
        {/* La vista previa es un blob del navegador: next/image no aplica acá. */}
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {vista && <img src={vista} alt="La factura subida" className="max-h-80 w-full rounded-md border object-contain" />}
        {leyendo && <p className="flex items-center gap-2 text-sm text-[#3730a3]"><Loader2 className="h-4 w-4 animate-spin" /> La IA está leyendo la factura…</p>}
        {!conIA && <p className="text-xs text-muted-foreground">La lectura con IA se activa con la clave de Claude: por ahora se completa a mano.</p>}
        {avisos && (
          <div className={`rounded-md border-l-[3px] px-3 py-2 text-[12.5px] ${avisos.length ? "border-l-[#f59e0b] bg-[#fffbeb] text-[#92400e]" : "border-l-[#1B4332] bg-[#f0f6f2] text-[#0f2a1f]"}`}>
            {avisos.length === 0 ? (
              <p className="flex items-center gap-1.5 font-semibold"><CheckCircle className="h-4 w-4" /> La leyó completa: revisá y completá unidad y titular.</p>
            ) : (
              <>
                <p className="flex items-center gap-1.5 font-semibold"><Sparkles className="h-4 w-4" /> Lo que falta o hay que mirar</p>
                <ul className="mt-1 list-disc pl-5">{avisos.map((a) => <li key={a}>{a}</li>)}</ul>
              </>
            )}
          </div>
        )}
      </section>

      {/* 2. Los datos */}
      <section className="space-y-4 rounded-lg border border-border/60 bg-[#FFFEFC] p-4">
        <p className="text-sm font-semibold text-primary">2 · Revisá y completá</p>
        {repetida && (
          <p className="flex items-center gap-1.5 rounded-md bg-[#fef2f2] px-3 py-2 text-[12.5px] font-medium text-[#991b1b]">
            <TriangleAlert className="h-4 w-4" /> Esta factura ya está cargada para ese proveedor: no se carga de nuevo.
          </p>
        )}
        <div className="grid gap-3 sm:grid-cols-2">
          <Campo label="Proveedor">
            <select className={SEL} value={d.proveedor} onChange={(e) => set("proveedor")(e.target.value)}>
              <option value="">Elegí…</option>
              {proveedores.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
            </select>
            {!d.proveedor && <Link href="/proveedores/nuevo" className="text-xs font-medium text-primary hover:underline">¿No está? Dalo de alta</Link>}
          </Campo>
          <Campo label="Tipo">
            <select className={SEL} value={d.tipo} onChange={(e) => set("tipo")(e.target.value)}>
              {TIPOS.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Número"><Input placeholder="00003-00008897" value={d.numero} onChange={(e) => set("numero")(e.target.value)} /></Campo>
          <div className="grid grid-cols-2 gap-2">
            <Campo label="Fecha"><Input type="date" max={hoy} value={d.fecha} onChange={(e) => set("fecha")(e.target.value)} /></Campo>
            <Campo label="Vence"><Input type="date" value={d.vencimiento} onChange={(e) => set("vencimiento")(e.target.value)} /></Campo>
          </div>
          <Campo label="Unidad">
            <select className={SEL} value={d.unidad} onChange={(e) => set("unidad")(e.target.value)}>
              <option value="">Elegí…</option>
              {unidades.map((u) => <option key={u.value} value={u.value}>{u.label}</option>)}
            </select>
          </Campo>
          <Campo label="A nombre de">
            <select className={SEL} value={d.facturadoA} onChange={(e) => set("facturadoA")(e.target.value)}>
              <option value="">Elegí…</option>
              {titulares.map((t) => <option key={t}>{t}</option>)}
            </select>
          </Campo>
          <Campo label="Categoría">
            <select className={SEL} value={d.categoria} onChange={(e) => set("categoria")(e.target.value)}>
              <option value="">Sin categoría</option>
              {categorias.map((c) => <option key={c}>{c}</option>)}
            </select>
          </Campo>
        </div>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Campo label="Neto"><Input inputMode="decimal" value={d.neto} onChange={(e) => set("neto")(e.target.value)} /></Campo>
          <Campo label="IVA"><Input inputMode="decimal" value={d.iva} onChange={(e) => set("iva")(e.target.value)} /></Campo>
          <Campo label="Percepciones"><Input inputMode="decimal" value={d.percepciones} onChange={(e) => set("percepciones")(e.target.value)} /></Campo>
          <Campo label="Total"><Input inputMode="decimal" value={d.total} onChange={(e) => set("total")(e.target.value)} /></Campo>
        </div>
        <Campo label="Qué es"><Input placeholder="Ej.: 3 perfiles C, aislante, tornillos" value={d.descripcion} onChange={(e) => set("descripcion")(e.target.value)} /></Campo>
        <Campo label="Dudas de la lectura (quedan marcadas para revisar)">
          <Input placeholder="Nada" value={d.dudas} onChange={(e) => set("dudas")(e.target.value)} />
        </Campo>

        <div>
          <div className="mb-1 flex items-center justify-between">
            <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">Ítems ({d.items.length})</span>
            <button type="button" onClick={() => setD((x) => ({ ...x, items: [...x.items, { descripcion: "", cantidad: null, precio_unitario: null, subtotal: null }] }))}
              className="inline-flex items-center gap-1 text-xs font-medium text-primary hover:underline"><Plus className="h-3.5 w-3.5" /> Agregar</button>
          </div>
          {d.items.length > 0 && (
            <div className="max-h-60 space-y-1 overflow-y-auto">
              {d.items.map((it, i) => (
                <div key={i} className="grid grid-cols-[minmax(0,1fr)_64px_96px_96px_24px] gap-1">
                  {(["descripcion", "cantidad", "precio_unitario", "subtotal"] as const).map((k) => (
                    <Input key={k} className="h-8 text-xs" value={it[k] ?? ""} placeholder={k === "descripcion" ? "Descripción" : k === "cantidad" ? "Cant." : k === "precio_unitario" ? "Precio" : "Subtotal"}
                      onChange={(e) => setD((x) => ({ ...x, items: x.items.map((y, j) => (j === i ? { ...y, [k]: e.target.value || null } : y)) }))} />
                  ))}
                  <button type="button" aria-label="Sacar ítem" onClick={() => setD((x) => ({ ...x, items: x.items.filter((_, j) => j !== i) }))}
                    className="flex items-center justify-center text-muted-foreground hover:text-[#b91c1c]"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[#f2f1ec] pt-4">
          <p className="text-xs text-muted-foreground">{faltan.length ? `Falta: ${faltan.join(", ")}` : "Queda pendiente para aprobar en la Bandeja."}</p>
          <Button size="sm" onClick={guardar} disabled={guardando || leyendo || repetida || !archivo}>
            {guardando ? <Loader2 className="h-4 w-4 animate-spin" /> : <FileUp className="h-4 w-4" />} Cargar factura
          </Button>
        </div>
      </section>
    </div>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block space-y-1">
      <span className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{label}</span>
      {children}
    </label>
  );
}
