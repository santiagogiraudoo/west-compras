"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, ClipboardCheck, Loader2, TriangleAlert, XCircle } from "lucide-react";
import { FichaCard } from "@/components/properties/FichaCard";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import type { Requisitos } from "@/lib/facturas/requisitos";
import { categoriaSugerida } from "@/lib/facturas/categorias";
import { guardarYAprobar } from "../actions";

interface Props {
  id: string;
  proveedorCodigo: string;
  inicial: { unidad: string; categoria: string; facturadoA: string };
  listas: { unidades: { value: string; label: string }[]; categorias: string[]; titulares: string[] };
  /** Rubro del proveedor: no se elige, se muestra. */
  rubroProveedor: string | null;
  requisitos: Requisitos;
  aprobada: boolean;
  /** Lo que no se arregla desde este formulario (lo resuelve el plomero o se corrige la carga). */
  sinPdf: boolean;
  totalNoCierra: boolean;
}

export function FichaForm({ id, proveedorCodigo, inicial, listas, rubroProveedor, requisitos, aprobada, sinPdf, totalNoCierra }: Props) {
  const router = useRouter();
  const [unidad, setUnidad] = useState(inicial.unidad);
  // Mientras nadie la elija, la categoría es la sugerida para la unidad elegida (editable).
  const [elegida, setElegida] = useState(inicial.categoria);
  const categoria = elegida || (categoriaSugerida(unidad || null, rubroProveedor) ?? "");
  const [facturadoA, setFacturadoA] = useState(inicial.facturadoA);
  const [motivo, setMotivo] = useState("");
  const [pending, start] = useTransition();

  // Lo que falta, recalculado con lo que se va eligiendo (el server vuelve a chequear).
  const faltan = useMemo(() => {
    const f: string[] = [];
    if (!unidad) f.push("Falta la unidad de negocio");
    if (!categoria && !aprobada) f.push("Falta la categoría");
    if (!facturadoA) f.push("Falta a nombre de quién está (titular)");
    if (sinPdf) f.push("Falta el PDF (lo vincula el plomero al subirlo a _Entrada facturas)");
    if (totalNoCierra) f.push("El total no cierra con neto + IVA + percepciones");
    return f;
  }, [unidad, categoria, facturadoA, aprobada, sinPdf, totalNoCierra]);

  const hayExcepcion = !aprobada && requisitos.excepciones.length > 0;
  const puede = faltan.length === 0 && (!hayExcepcion || motivo.trim().length >= 5);

  function aprobar() {
    start(async () => {
      const r = await guardarYAprobar({ id, unidad, categoria, facturadoA, motivo });
      if (r.ok) {
        toast.success(r.mensaje);
        router.push("/bandeja");
      } else {
        toast.error(r.mensaje);
      }
    });
  }

  return (
    <FichaCard icon={ClipboardCheck} title={aprobada ? "Datos de la factura" : "Para aprobar"} className="self-start">
    <div className="space-y-4 px-5 py-4 text-sm">
      <Campo label="Unidad de negocio">
        <Select value={unidad} onValueChange={setUnidad}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Elegí la unidad" /></SelectTrigger>
          <SelectContent>{listas.unidades.map((u) => <SelectItem key={u.value} value={u.value}>{u.label}</SelectItem>)}</SelectContent>
        </Select>
      </Campo>
      <Campo label="Categoría">
        <Select value={categoria} onValueChange={setElegida}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Elegí la categoría" /></SelectTrigger>
          <SelectContent>{listas.categorias.map((c) => <SelectItem key={c} value={c}>{c}</SelectItem>)}</SelectContent>
        </Select>
        {!elegida && categoria && (
          <p className="text-xs text-muted-foreground">Sugerida por la unidad: cambiala si no corresponde.</p>
        )}
      </Campo>
      <p className="text-xs text-muted-foreground">Rubro (sale del proveedor): <span className="font-medium text-foreground">{rubroProveedor ?? "sin rubro"}</span></p>
      <Campo label="A nombre de (titular)">
        <Select value={facturadoA} onValueChange={setFacturadoA}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Elegí el titular" /></SelectTrigger>
          <SelectContent>{listas.titulares.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </Campo>

      {faltan.length > 0 && (
        <ul className="space-y-1 rounded-[6px] border-l-[3px] border-l-[#dc2626] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#991b1b]">
          {faltan.map((f) => <li key={f} className="flex gap-1.5"><XCircle className="mt-0.5 h-3.5 w-3.5 shrink-0" /> {f}</li>)}
        </ul>
      )}

      {hayExcepcion && (
        <Campo label={`Excepción: ${requisitos.excepciones.join(" · ")}`}>
          <Textarea
            value={motivo}
            onChange={(e) => setMotivo(e.target.value)}
            placeholder="Por qué se aprueba igual (ej.: servicio, no hay entrega)"
            rows={2}
          />
        </Campo>
      )}

      {requisitos.avisos.length > 0 && (
        <div className="rounded-[6px] border-l-[3px] border-l-[#f59e0b] bg-[#fffbeb] px-3 py-2 text-[13px] text-[#92400e]">
          <p className="flex items-center gap-1.5 font-semibold"><TriangleAlert className="h-3.5 w-3.5" /> No frena la factura, sí el pago</p>
          <ul className="mt-1 space-y-0.5">{requisitos.avisos.map((a) => <li key={a}>{a}</li>)}</ul>
          <a href={`/proveedores/${proveedorCodigo}`} className="mt-1 inline-block font-medium underline underline-offset-2">Completar el proveedor</a>
        </div>
      )}

      <Button size="sm" className="h-9 w-full" disabled={!puede || pending} onClick={aprobar}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {aprobada ? "Guardar" : "Aprobar"}
      </Button>
    </div>
    </FichaCard>
  );
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}
