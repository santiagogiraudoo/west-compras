"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Building2, Landmark, Loader2, Phone, Save } from "lucide-react";
import { FichaCard } from "@/components/properties/FichaCard";
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
  /** El texto libre de cbu_alias, para comparar con los campos (trae la fuente del dato). */
  textoCuenta?: string | null;
}

export function ProveedorForm({ codigo, inicial, rubros, textoCuenta }: Props) {
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
    <div className="space-y-4">
      <div className="grid gap-4 xl:grid-cols-2">
        <FichaCard icon={Building2} title="Datos fiscales">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Campo label="Razón social" obligatorio error={errores.razonSocial}>
              <Input value={datos.razonSocial} onChange={(e) => set("razonSocial")(e.target.value)} />
            </Campo>
            <Campo label="CUIT" obligatorio error={errores.cuit}>
              <Input value={datos.cuit} onChange={(e) => set("cuit")(e.target.value)} placeholder="30-12345678-9" />
            </Campo>
            <Campo label="Condición de IVA" obligatorio error={errores.condicionIva}>
              <Opciones value={datos.condicionIva} onChange={set("condicionIva")} opciones={[...CONDICIONES_IVA]} placeholder="Elegí" />
            </Campo>
            <Campo label="Rubro" obligatorio error={errores.rubro}>
              <Opciones value={datos.rubro} onChange={set("rubro")} opciones={rubros} placeholder="Elegí el rubro" />
            </Campo>
          </div>
        </FichaCard>

        <FichaCard icon={Landmark} title="Cuenta para pagar">
          <div className="grid gap-4 px-5 py-4 sm:grid-cols-2">
            <Campo label="CBU o CVU" obligatorio error={errores.cbu}>
              <Input value={datos.cbu} onChange={(e) => set("cbu")(e.target.value)} placeholder="22 dígitos" inputMode="numeric" />
            </Campo>
            <Campo label="Alias" error={errores.alias}>
              <Input value={datos.alias} onChange={(e) => set("alias")(e.target.value)} placeholder="CORRALON.EJEMPLO" />
            </Campo>
            <Campo label="Titular de la cuenta" obligatorio error={errores.cuentaTitular}>
              <Input value={datos.cuentaTitular} onChange={(e) => set("cuentaTitular")(e.target.value)} placeholder="A nombre de quién está" />
            </Campo>
            <Campo label="Banco" error={errores.banco}>
              <Input value={datos.banco} onChange={(e) => set("banco")(e.target.value)} placeholder="Sale del CBU si lo dejás vacío" />
            </Campo>
            {textoCuenta && (
              <p className="rounded-[6px] bg-[#fafaf7] px-3 py-2 text-xs text-muted-foreground sm:col-span-2">
                Lo que decía antes: <span className="italic">{textoCuenta}</span>
              </p>
            )}
          </div>
        </FichaCard>
      </div>

      <FichaCard icon={Phone} title="Contacto y condiciones">
        <div className="grid gap-4 px-5 py-4 sm:grid-cols-2 xl:grid-cols-3">
          <Campo label="WhatsApp" obligatorio error={errores.telefono}>
            <Input value={datos.telefono} onChange={(e) => set("telefono")(e.target.value)} placeholder="260 4123456" />
          </Campo>
          <Campo label="Condición de pago" obligatorio error={errores.condicionPago}>
            <Input value={datos.condicionPago} onChange={(e) => set("condicionPago")(e.target.value)} placeholder="Contado, 30 días f.f., cuenta corriente…" />
          </Campo>
          <Campo label="Plazo (días)" error={errores.plazoDias}>
            <Input value={datos.plazoDias} onChange={(e) => set("plazoDias")(e.target.value)} inputMode="numeric" />
          </Campo>
          <Campo label="Medio de pago" obligatorio error={errores.medioPago}>
            <Opciones value={datos.medioPago} onChange={set("medioPago")} opciones={[...MEDIOS_PAGO]} placeholder="Elegí" />
          </Campo>
          <Campo label="Mail" error={errores.email}>
            <Input value={datos.email} onChange={(e) => set("email")(e.target.value)} />
          </Campo>
          <Campo label="Contacto (nombre)" error={errores.contacto}>
            <Input value={datos.contacto} onChange={(e) => set("contacto")(e.target.value)} />
          </Campo>
        </div>
      </FichaCard>

      <div className="flex items-center justify-between gap-3">
        <p className="text-xs text-muted-foreground"><span className="text-[#b91c1c]">*</span> Obligatorio para poder pagarle (decisión 17/11).</p>
        <Button size="sm" className="h-9" onClick={guardar} disabled={pending}>
          {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {codigo ? "Guardar" : "Dar de alta"}
        </Button>
      </div>
    </div>
  );
}

function Campo({ label, obligatorio, error, children }: { label: string; obligatorio?: boolean; error?: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">
        {label}{obligatorio && <span className="text-[#b91c1c]">*</span>}
      </Label>
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
