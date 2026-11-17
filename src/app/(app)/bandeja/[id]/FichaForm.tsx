"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { CheckCircle2, Loader2 } from "lucide-react";
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
    <aside className="space-y-4 rounded-md border bg-card p-4 text-sm">
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
      <p className="text-xs text-muted-foreground">Rubro (sale del proveedor): {rubroProveedor ?? "sin rubro"}</p>
      <Campo label="A nombre de (titular)">
        <Select value={facturadoA} onValueChange={setFacturadoA}>
          <SelectTrigger className="w-full"><SelectValue placeholder="Elegí el titular" /></SelectTrigger>
          <SelectContent>{listas.titulares.map((t) => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
        </Select>
      </Campo>

      {faltan.length > 0 && (
        <ul className="space-y-1 rounded-md bg-red-50 p-3 text-red-800">
          {faltan.map((f) => <li key={f}>• {f}</li>)}
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
        <div className="rounded-md bg-amber-50 p-3 text-amber-900">
          <p className="font-medium">No frena la factura, sí el pago:</p>
          <ul>{requisitos.avisos.map((a) => <li key={a}>• {a}</li>)}</ul>
          <a href={`/proveedores/${proveedorCodigo}`} className="mt-1 inline-block underline">Completar el proveedor</a>
        </div>
      )}

      <Button size="sm" className="w-full" disabled={!puede || pending} onClick={aprobar}>
        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
        {aprobada ? "Guardar" : "Aprobar"}
      </Button>
    </aside>
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
