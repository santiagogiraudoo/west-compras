"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger,
} from "@/components/ui/dialog";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Copiar } from "@/components/shared/Copiar";
import { calcularPago, MEDIOS_PAGO, RETENCIONES, type ClaveRetencion } from "@/lib/op/pago";
import { pagarOP } from "../op/actions";

interface Props {
  numero: string;
  proveedor: string;
  total: string;
  medio: string;
  hoy: string;
}

const SIN_RET: Record<ClaveRetencion, number | null> = { ganancias: null, iva: null, iibb: null, suss: null, otras: null };

/**
 * Registrar el pago de una OP autorizada: retenciones (a mano hasta tener el doc de
 * Candela), neto calculado con la misma función que el server, y comprobante subido o
 * su link. Al confirmar queda Pagada con cc.cargar_pagos.
 */
export function PagarOP({ numero, proveedor, total, medio: medioInicial, hoy }: Props) {
  const router = useRouter();
  const [pendiente, startTransition] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [medio, setMedio] = useState(medioInicial);
  const [referencia, setReferencia] = useState("");
  const [link, setLink] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [ret, setRet] = useState(SIN_RET);

  const retenciones = Object.fromEntries(
    RETENCIONES.map((r) => [r.clave, ret[r.clave] == null ? "" : String(ret[r.clave])]),
  ) as Record<ClaveRetencion, string>;
  const calculo = calcularPago(total, { fecha, medio, referencia, comprobante: link, retenciones }, hoy);
  const errores = [...calculo.errores, ...(!archivo && !link.trim() ? ["Subí el comprobante o pegá su link"] : [])];

  function pagar() {
    const form = new FormData();
    form.set("fecha", fecha);
    form.set("medio", medio);
    form.set("referencia", referencia);
    form.set("link", link);
    for (const r of RETENCIONES) form.set(`ret_${r.clave}`, retenciones[r.clave]);
    if (archivo) form.set("archivo", archivo);
    startTransition(async () => {
      const r = await pagarOP(numero, form);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      <DialogTrigger asChild>
        <Button size="sm"><Banknote className="h-4 w-4" /> Registrar pago</Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Pago de la {numero}</DialogTitle>
          <DialogDescription>{proveedor}</DialogDescription>
        </DialogHeader>

        <div className="space-y-2 text-sm">
          <p className="text-xs text-muted-foreground">Retenciones (a mano hasta tener el doc de retenciones)</p>
          <div className="grid grid-cols-3 gap-2">
            {RETENCIONES.map((r) => (
              <Campo key={r.clave} label={r.label}>
                <NumericInput currencyMask currency="ARS" value={ret[r.clave]}
                  onValueChange={(v) => setRet({ ...ret, [r.clave]: v })} />
              </Campo>
            ))}
          </div>
        </div>

        <dl className="grid grid-cols-3 gap-2 rounded-md bg-muted/50 p-3 text-sm">
          <div><dt className="text-xs text-muted-foreground">Total OP</dt><dd><MoneyCell value={Number(total)} currency="ARS" decimals={2} /></dd></div>
          <div><dt className="text-xs text-muted-foreground">Retenciones</dt><dd><MoneyCell value={Number(calculo.totalRetenciones)} currency="ARS" decimals={2} /></dd></div>
          <div>
            <dt className="text-xs text-muted-foreground">Neto a transferir</dt>
            <dd className="font-semibold"><Copiar etiqueta="Neto" valor={calculo.neto.replace(".", ",")} /></dd>
          </div>
        </dl>

        <div className="grid grid-cols-2 gap-3 text-sm">
          <Campo label="Fecha de pago">
            <DateInput value={fecha} onChange={(e) => setFecha(e.target.value)} />
          </Campo>
          <Campo label="Medio de pago">
            <Select value={medio} onValueChange={setMedio}>
              <SelectTrigger className="w-full"><SelectValue placeholder="Elegí el medio" /></SelectTrigger>
              <SelectContent>
                {MEDIOS_PAGO.map((m) => <SelectItem key={m} value={m}>{m === "Compensacion" ? "Compensación" : m}</SelectItem>)}
              </SelectContent>
            </Select>
          </Campo>
          <Campo label="Referencia bancaria">
            <Input value={referencia} onChange={(e) => setReferencia(e.target.value)} placeholder="N° de transferencia o echeq" />
          </Campo>
          <Campo label="Comprobante (PDF o foto, hasta 5 MB)">
            <Input type="file" accept="application/pdf,image/jpeg,image/png"
              onChange={(e) => setArchivo(e.target.files?.[0] ?? null)} />
          </Campo>
          <div className="col-span-2">
            <Campo label="…o el link del comprobante">
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://… (SharePoint)" disabled={!!archivo} />
            </Campo>
          </div>
        </div>

        {errores.length > 0 && (
          <ul className="rounded-md bg-red-50 p-3 text-sm text-red-800">
            {errores.map((e) => <li key={e}>• {e}</li>)}
          </ul>
        )}

        <DialogFooter>
          <Button size="sm" disabled={pendiente || errores.length > 0} onClick={pagar}>
            <Banknote className="h-4 w-4" /> Confirmar pago
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
