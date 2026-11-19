"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Banknote, CheckCircle, FileUp, Loader2, Sparkles, TriangleAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { DateInput } from "@/components/ui/date-input";
import { NumericInput } from "@/components/ui/numeric-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { Copiar } from "@/components/shared/Copiar";
import { calcularPago, MEDIOS_PAGO, RETENCIONES, type ClaveRetencion } from "@/lib/op/pago";
import { cotejarComprobante, type LecturaComprobante } from "@/lib/pagos/cotejo";
import { leerComprobantePago, pagarOP } from "@/app/(app)/op/actions";

interface Props {
  numero: string;
  proveedor: string;
  total: string;
  medio: string;
  hoy: string;
  /** La cuenta del proveedor, para cotejar contra el comprobante. */
  cbu: string | null;
  alias: string | null;
}

const SIN_RET: Record<ClaveRetencion, number | null> = { ganancias: null, iva: null, iibb: null, suss: null, otras: null };
const TIPOS = ["application/pdf", "image/jpeg", "image/png"];

/**
 * Registrar el pago de una OP autorizada. Primero el comprobante: al elegirlo se lee solo
 * (API de Claude) y precarga fecha, referencia y medio, y avisa si el monto o la cuenta
 * no coinciden. Retenciones a mano hasta tener el doc de Candela; el neto se calcula con
 * la misma función que el server. Al confirmar queda Pagada con cc.cargar_pagos.
 */
export function PagarOP({ numero, proveedor, total, medio: medioInicial, hoy, cbu, alias }: Props) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [pendiente, startTransition] = useTransition();
  const [leyendo, startLectura] = useTransition();
  const [abierto, setAbierto] = useState(false);
  const [fecha, setFecha] = useState(hoy);
  const [medio, setMedio] = useState(medioInicial);
  const [referencia, setReferencia] = useState("");
  const [link, setLink] = useState("");
  const [archivo, setArchivo] = useState<File | null>(null);
  const [lectura, setLectura] = useState<LecturaComprobante | null>(null);
  const [avisoLectura, setAvisoLectura] = useState<string | null>(null);
  const [ret, setRet] = useState(SIN_RET);

  const retenciones = Object.fromEntries(
    RETENCIONES.map((r) => [r.clave, ret[r.clave] == null ? "" : String(ret[r.clave])]),
  ) as Record<ClaveRetencion, string>;
  const calculo = calcularPago(total, { fecha, medio, referencia, comprobante: link, retenciones }, hoy);
  const cotejo = lectura ? cotejarComprobante(lectura, { neto: calculo.neto, cbu, alias }) : [];
  const errores = [
    ...calculo.errores,
    // Una compensación (NC contra facturas) no mueve plata: no hay comprobante.
    ...(!archivo && !link.trim() && medio !== "Compensacion" ? ["Subí el comprobante o pegá su link"] : []),
    ...(archivo && !TIPOS.includes(archivo.type) ? ["El comprobante tiene que ser PDF, JPG o PNG"] : []),
    ...(archivo && archivo.size > 5 * 1024 * 1024 ? ["El comprobante pesa más de 5 MB"] : []),
  ];

  function elegir(f: File | null) {
    setArchivo(f);
    setLectura(null);
    setAvisoLectura(null);
    if (!f || !TIPOS.includes(f.type) || f.size > 5 * 1024 * 1024) return;
    const form = new FormData();
    form.set("archivo", f);
    startLectura(async () => {
      let r;
      try {
        r = await leerComprobantePago(form);
      } catch {
        setAvisoLectura("No se pudo leer el comprobante. Completá los datos a mano.");
        return;
      }
      if (!r.ok) { setAvisoLectura(r.mensaje); return; }
      setLectura(r.datos);
      // Se precarga lo que se leyó y no pisa lo que ya se escribió a mano.
      if (r.datos.fecha && /^\d{4}-\d{2}-\d{2}$/.test(r.datos.fecha)) setFecha(r.datos.fecha);
      if (r.datos.referencia) setReferencia((v) => v || r.datos.referencia || "");
      if (r.datos.medio && (MEDIOS_PAGO as readonly string[]).includes(r.datos.medio)) setMedio(r.datos.medio);
    });
  }

  function pagar() {
    const form = new FormData();
    form.set("fecha", fecha);
    form.set("medio", medio);
    form.set("referencia", referencia);
    form.set("link", link);
    for (const r of RETENCIONES) form.set(`ret_${r.clave}`, retenciones[r.clave]);
    if (archivo) form.set("archivo", archivo);
    startTransition(async () => {
      let r;
      try {
        r = await pagarOP(numero, form);
      } catch {
        toast.error("No se pudo registrar el pago. Probá de nuevo; si sigue, avisá.");
        return;
      }
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      setAbierto(false);
      router.refresh();
    });
  }

  return (
    <Dialog open={abierto} onOpenChange={setAbierto}>
      {/* Botón común en vez de DialogTrigger: el aria-controls que le pone Radix no
          coincidía entre el server y el navegador y React avisaba de la hidratación. */}
      <Button size="sm" onClick={() => setAbierto(true)}><Banknote className="h-4 w-4" /> Registrar pago</Button>
      <DialogContent className="flex max-h-[88vh] flex-col gap-0 overflow-hidden border-l-[3px] border-l-[#1B4332] p-0 sm:max-w-2xl">
        <DialogHeader className="border-b bg-[#FFFEFC] px-6 pt-5 pb-3">
          <DialogTitle className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[#1B4332]">
            <Banknote className="h-4 w-4" /> Pago de la {numero}
          </DialogTitle>
          <DialogDescription>{proveedor}</DialogDescription>
        </DialogHeader>

        <div className="flex-1 space-y-5 overflow-y-auto px-6 py-5 text-sm">
          {/* 1. El comprobante: se lee solo */}
          <section className="space-y-2">
            <Rotulo>Comprobante</Rotulo>
            <input ref={entrada} type="file" accept="application/pdf,image/jpeg,image/png" className="hidden"
              onChange={(e) => elegir(e.target.files?.[0] ?? null)} />
            {!archivo ? (
              <button type="button" onClick={() => entrada.current?.click()}
                className="flex w-full items-center gap-3 rounded-[8px] border border-dashed border-[#cfcfc7] bg-[#fafaf7] px-4 py-4 text-left hover:border-primary hover:bg-[#f0f6f2]">
                <FileUp className="h-6 w-6 text-primary" />
                <span>
                  <span className="block font-medium text-foreground">Subir el comprobante (PDF o foto, hasta 5 MB)</span>
                  <span className="block text-xs text-muted-foreground">Se lee solo: precarga fecha, referencia y medio, y avisa si algo no coincide.</span>
                </span>
              </button>
            ) : (
              <div className="rounded-[8px] border border-[#eeede8] bg-white px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate font-medium">{archivo.name}</span>
                  <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => { elegir(null); if (entrada.current) entrada.current.value = ""; }}>
                    <X className="h-3.5 w-3.5" /> Cambiar
                  </Button>
                </div>
                {leyendo && (
                  <p className="mt-2 flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Leyendo el comprobante…
                  </p>
                )}
                {lectura && (
                  <div className="mt-2 space-y-1.5">
                    <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-[#525252]">
                      <Sparkles className="h-3.5 w-3.5 text-[#B8960C]" />
                      <span>Leído:</span>
                      {lectura.monto && <MoneyCell value={Number(lectura.monto)} currency="ARS" decimals={0} className="font-medium text-foreground" />}
                      {lectura.fecha && <span>· {lectura.fecha.split("-").reverse().join("/")}</span>}
                      {lectura.referencia && <span>· ref. {lectura.referencia}</span>}
                      {lectura.titular_destino && <span>· a {lectura.titular_destino}</span>}
                    </p>
                    {cotejo.map((c) => (
                      <p key={c.texto} className={`flex items-center gap-1.5 text-xs font-medium ${c.ok ? "text-[#0f2a1f]" : "text-[#92400e]"}`}>
                        {c.ok ? <CheckCircle className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />} {c.texto}
                      </p>
                    ))}
                  </div>
                )}
                {avisoLectura && <p className="mt-2 text-xs text-muted-foreground">{avisoLectura}</p>}
              </div>
            )}
            {!archivo && (
              <Input value={link} onChange={(e) => setLink(e.target.value)} placeholder="…o pegá el link del comprobante (SharePoint)" className="h-8 text-[13px]" />
            )}
          </section>

          {/* 2. Retenciones y neto */}
          <section className="space-y-2">
            <Rotulo>Retenciones (a mano hasta tener el doc de retenciones)</Rotulo>
            <div className="grid grid-cols-5 gap-2">
              {RETENCIONES.map((r) => (
                <Campo key={r.clave} label={r.label}>
                  <NumericInput currencyMask currency="ARS" value={ret[r.clave]}
                    onValueChange={(v) => setRet({ ...ret, [r.clave]: v })} />
                </Campo>
              ))}
            </div>
            <div className="grid grid-cols-3 gap-3 rounded-[8px] border border-l-[3px] border-l-[#B8960C] bg-[#B8960C]/5 px-4 py-3">
              <Dato k="Total OP"><MoneyCell value={Number(total)} currency="ARS" decimals={0} /></Dato>
              <Dato k="Retenciones"><MoneyCell value={Number(calculo.totalRetenciones)} currency="ARS" decimals={0} /></Dato>
              <Dato k="Neto a transferir">
                <span className="text-base font-semibold"><Copiar etiqueta="Neto" valor={calculo.neto.replace(".", ",")} /></span>
              </Dato>
            </div>
          </section>

          {/* 3. Datos del pago (precargados si se leyó el comprobante) */}
          <section className="grid grid-cols-3 gap-3">
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
          </section>

          {errores.length > 0 && (
            <ul className="rounded-[8px] border-l-[3px] border-l-[#dc2626] bg-[#fef2f2] px-3 py-2 text-[13px] text-[#991b1b]">
              {errores.map((e) => <li key={e}>• {e}</li>)}
            </ul>
          )}
        </div>

        <DialogFooter className="border-t bg-[#FFFEFC] px-6 py-3">
          <Button size="sm" variant="ghost" onClick={() => setAbierto(false)} disabled={pendiente}>
            <X className="h-4 w-4" /> Cancelar
          </Button>
          <Button size="sm" disabled={pendiente || leyendo || errores.length > 0} onClick={pagar}>
            {pendiente ? <Loader2 className="h-4 w-4 animate-spin" /> : <Banknote className="h-4 w-4" />}
            Confirmar pago · <MoneyCell value={Number(calculo.neto)} currency="ARS" decimals={0} />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Rotulo({ children }: { children: React.ReactNode }) {
  return <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">{children}</p>;
}

function Campo({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground">{label}</Label>
      {children}
    </div>
  );
}

function Dato({ k, children }: { k: string; children: React.ReactNode }) {
  return (
    <div>
      <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#1B4332]/70">{k}</p>
      <div className="mt-0.5">{children}</div>
    </div>
  );
}
