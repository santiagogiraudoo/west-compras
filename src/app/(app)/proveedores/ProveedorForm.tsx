"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Loader2, Save } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { CONDICIONES_IVA, MEDIOS_PAGO, type AltaProveedor, type ErroresAlta } from "@/lib/proveedores/validar";
import { guardarProveedor } from "./actions";

interface Props {
  codigo: string | null;
  inicial: AltaProveedor;
  rubros: string[];
}

export function ProveedorForm({ codigo, inicial, rubros }: Props) {
  const router = useRouter();
  const [datos, setDatos] = useState<AltaProveedor>(inicial);
  const [errores, setErrores] = useState<ErroresAlta>({});
  const [pending, start] = useTransition();

  const set = (k: keyof AltaProveedor) => (v: string) => setDatos((d) => ({ ...d, [k]: v }));

  function guardar() {
    start(async () => {
      const r = await guardarProveedor(codigo, datos);
      setErrores(r.errores ?? {});
      if (r.ok) {
        toast.success(r.mensaje);
        router.push(`/proveedores/${r.codigo}`);
        router.refresh();
      } else {
        toast.error(r.mensaje);
      }
    });
  }

  return (
    <div className="space-y-4 rounded-md border bg-card p-5 text-sm">
      <p className="text-xs text-muted-foreground">
        Los marcados con * son obligatorios para poder pagarle (decisión 17/11).
      </p>
      <div className="grid gap-4 md:grid-cols-2">
        <Campo label="Razón social *" error={errores.razonSocial}>
          <Input value={datos.razonSocial} onChange={(e) => set("razonSocial")(e.target.value)} />
        </Campo>
        <Campo label="CUIT *" error={errores.cuit}>
          <Input value={datos.cuit} onChange={(e) => set("cuit")(e.target.value)} placeholder="30-12345678-9" />
        </Campo>
        <Campo label="Condición de IVA *" error={errores.condicionIva}>
          <Opciones value={datos.condicionIva} onChange={set("condicionIva")} opciones={[...CONDICIONES_IVA]} placeholder="Elegí" />
        </Campo>
        <Campo label="Rubro *" error={errores.rubro}>
          <Opciones value={datos.rubro} onChange={set("rubro")} opciones={rubros} placeholder="Elegí el rubro" />
        </Campo>
        <Campo label="CBU o alias *" error={errores.cbuAlias}>
          <Input value={datos.cbuAlias} onChange={(e) => set("cbuAlias")(e.target.value)} placeholder="22 dígitos o alias" />
        </Campo>
        <Campo label="WhatsApp *" error={errores.telefono}>
          <Input value={datos.telefono} onChange={(e) => set("telefono")(e.target.value)} placeholder="260 4123456" />
        </Campo>
        <Campo label="Condición de pago *" error={errores.condicionPago}>
          <Input value={datos.condicionPago} onChange={(e) => set("condicionPago")(e.target.value)} placeholder="Contado, 30 días f.f., cuenta corriente…" />
        </Campo>
        <Campo label="Plazo (días)" error={errores.plazoDias}>
          <Input value={datos.plazoDias} onChange={(e) => set("plazoDias")(e.target.value)} inputMode="numeric" />
        </Campo>
        <Campo label="Medio de pago *" error={errores.medioPago}>
          <Opciones value={datos.medioPago} onChange={set("medioPago")} opciones={[...MEDIOS_PAGO]} placeholder="Elegí" />
        </Campo>
        <Campo label="Mail" error={errores.email}>
          <Input value={datos.email} onChange={(e) => set("email")(e.target.value)} />
        </Campo>
        <Campo label="Contacto (nombre)" error={errores.contacto}>
          <Input value={datos.contacto} onChange={(e) => set("contacto")(e.target.value)} />
        </Campo>
      </div>
      <div className="flex justify-end">
        <Button size="sm" onClick={guardar} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {codigo ? "Guardar" : "Dar de alta"}
        </Button>
      </div>
    </div>
  );
}

function Campo({ label, error, children }: { label: string; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
      {error && <p className="text-xs text-red-700">{error}</p>}
    </div>
  );
}

function Opciones({ value, onChange, opciones, placeholder }: { value: string; onChange: (v: string) => void; opciones: string[]; placeholder: string }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger className="w-full"><SelectValue placeholder={placeholder} /></SelectTrigger>
      <SelectContent>{opciones.map((o) => <SelectItem key={o} value={o}>{o}</SelectItem>)}</SelectContent>
    </Select>
  );
}
