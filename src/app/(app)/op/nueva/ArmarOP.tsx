"use client";

import { useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { FilePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { validarSeleccionOP, type Abierto } from "@/lib/cuenta/calculos";
import { reservarOP } from "../actions";

interface Props {
  proveedor: { codigo: string; razon_social: string; cuit: string | null; cbu: string | null; alias: string | null; banco: string | null; cuenta_titular: string | null };
  /** Lo que le falta al alta: con algo acá no se puede pagar. */
  faltan: string[];
  facturas: Abierto[];
  hoy: string;
}

/**
 * Elegir facturas aprobadas con saldo libre (pueden ser de varias unidades) y reservar
 * la OP. La validación es la misma función que usa el server.
 */
export function ArmarOP({ proveedor, faltan, facturas, hoy }: Props) {
  const router = useRouter();
  const [sel, setSel] = useState<Set<string>>(new Set());
  const [pendiente, startTransition] = useTransition();

  const elegidas = useMemo(() => facturas.filter((f) => sel.has(f.id)), [facturas, sel]);
  const { errores, total, titular } = validarSeleccionOP(elegidas);
  const titularElegido = elegidas[0]?.facturado_a ?? null;

  function cambiar(id: string, si: boolean) {
    const n = new Set(sel);
    if (si) n.add(id); else n.delete(id);
    setSel(n);
  }

  function reservar() {
    startTransition(async () => {
      const r = await reservarOP(proveedor.codigo, [...sel]);
      if (!r.ok) { toast.error(r.mensaje); return; }
      toast.success(r.mensaje);
      router.push("/op");
    });
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
      <div className="min-w-0 self-start rounded-md border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-8" />
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Comprobante</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Unidad</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Titular</TableHead>
              <TableHead className="text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>Vence</TableHead>
              <TableHead className="text-right text-xs font-semibold uppercase tracking-wide" style={{ color: "#B8960C" }}>A pagar</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {facturas.map((f) => {
              // Una OP es de un solo titular: las de otro titular se apagan.
              const otroTitular = titularElegido !== null && f.facturado_a !== titularElegido;
              return (
                <TableRow key={f.id} className={otroTitular ? "opacity-40" : ""}>
                  <TableCell>
                    <Checkbox checked={sel.has(f.id)} disabled={otroTitular || !f.facturado_a}
                      onCheckedChange={(v) => cambiar(f.id, v === true)} aria-label={`Elegir ${f.numero}`} />
                  </TableCell>
                  <TableCell>{f.tipo} {f.numero}</TableCell>
                  <TableCell>{f.unidad_codigo}</TableCell>
                  <TableCell className="whitespace-normal">{f.facturado_a ?? <span className="text-red-700">Sin titular</span>}</TableCell>
                  <TableCell className={f.vencimiento && f.vencimiento < hoy ? "text-red-700" : ""}>
                    {formatDate(f.vencimiento)}
                  </TableCell>
                  <TableCell className="text-right"><MoneyCell value={Number(f.libre)} currency="ARS" decimals={2} /></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </div>

      <aside className="space-y-3 self-start rounded-lg border border-border/60 bg-[#FFFEFC] p-4 text-sm">
        <div>
          <div className="text-xs font-medium text-muted-foreground">Total de la OP</div>
          <MoneyCell value={Number(total)} currency="ARS" decimals={2} className="block text-xl font-semibold text-primary" />
          <div className="text-xs text-muted-foreground">{elegidas.length} comprobantes</div>
        </div>
        <Dato label="Paga" v={titular ?? "—"} />
        <Dato label="A" v={`${proveedor.razon_social}${proveedor.cuit ? ` · CUIT ${proveedor.cuit}` : ""}`} />
        <Dato label="CBU / CVU" v={proveedor.cbu ?? "—"} />
        <Dato label="Alias" v={proveedor.alias ?? "—"} />
        <Dato label="Banco" v={proveedor.banco ?? "—"} />
        <Dato label="Titular de la cuenta" v={proveedor.cuenta_titular ?? "—"} />
        {faltan.length > 0 && (
          <p className="rounded-md border border-red-200 bg-red-50 p-2 text-xs text-red-800">
            Antes de pagar completá el alta del proveedor: falta {faltan.join(", ")}.{" "}
            <Link href={`/proveedores/${proveedor.codigo}`} className="underline">Completar el alta</Link>
          </p>
        )}
        {elegidas.length > 0 && errores.length > 0 && (
          <ul className="space-y-1 text-xs text-red-800">{errores.map((e) => <li key={e}>{e}</li>)}</ul>
        )}
        <Button size="sm" className="w-full" onClick={reservar}
          disabled={pendiente || errores.length > 0 || faltan.length > 0}>
          <FilePlus className="h-4 w-4" /> {pendiente ? "Reservando…" : "Reservar OP"}
        </Button>
        <p className="text-xs text-muted-foreground">Queda Prevista. Las retenciones y el pago se cargan después.</p>
      </aside>
    </div>
  );
}

function Dato({ label, v }: { label: string; v: string }) {
  return (
    <div>
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="break-all">{v}</div>
    </div>
  );
}
