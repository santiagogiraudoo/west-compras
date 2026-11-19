import Link from "next/link";
import { Mail, MessageCircle, Upload } from "lucide-react";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { StatusPill } from "@/components/shared/StatusPill";
import { listarEntrada, type FilaEntrada } from "@/lib/entrada/queries";
import { SubirAlBuzon, Reprocesar } from "./SubirAlBuzon";

export const dynamic = "force-dynamic";

const ESTADO: Record<FilaEntrada["estado"], { tono: "success" | "red" | "amber" | "indigo" | "neutral"; texto: string }> = {
  procesado: { tono: "success", texto: "Procesado" },
  revisar: { tono: "red", texto: "A revisar" },
  duplicado: { tono: "neutral", texto: "Repetido" },
  descartado: { tono: "neutral", texto: "Descartado" },
  recibido: { tono: "amber", texto: "Recibido" },
  leido: { tono: "indigo", texto: "Leído" },
};
const CANAL = { app: Upload, whatsapp: MessageCircle, mail: Mail } as const;
const CLASE: Record<string, string> = {
  factura: "Factura", nota_credito: "Nota de crédito", nota_debito: "Nota de débito", remito: "Remito", comprobante_pago: "Comprobante de pago", otro: "Otro",
};

/**
 * El buzón único (docs/proyecto/09_flujo_entrada.md): todo lo que llega por la app, WhatsApp o
 * el mail, con lo que hizo el procesador. Lo que no pasó solo queda arriba, con el motivo.
 */
export default async function EntradaPage() {
  const filas = await listarEntrada();
  return (
    <div className="mx-auto max-w-6xl space-y-5 px-8 py-6">
      <TituloDePestana label="Buzón" />
      <div>
        <h1 className="text-2xl font-bold text-primary">Buzón</h1>
        <p className="text-sm text-muted-foreground">
          Facturas, remitos y comprobantes que llegan por la app, WhatsApp o el mail. Se leen solos: las facturas van a la Bandeja y los remitos se cruzan con su factura.
        </p>
      </div>
      <SubirAlBuzon />
      <div className="overflow-hidden rounded-lg border bg-white">
        {filas.length === 0 && <p className="p-6 text-sm text-muted-foreground">Todavía no llegó nada.</p>}
        {filas.map((f) => {
          const Icono = CANAL[f.canal];
          const e = ESTADO[f.estado];
          return (
            <div key={f.id} className="grid grid-cols-[24px_minmax(0,1.4fr)_minmax(0,1fr)_120px_minmax(0,1.6fr)] items-center gap-3 border-b px-4 py-2.5 text-sm last:border-b-0">
              <Icono className="h-4 w-4 text-muted-foreground" aria-label={f.canal} />
              <div className="min-w-0">
                <a href={`/entrada/${f.id}/archivo`} target="_blank" className="block truncate font-medium hover:underline">{f.nombre}</a>
                <span className="text-xs text-muted-foreground">{f.recibido_en} · {f.remitente_nombre ?? f.remitente ?? "—"}</span>
              </div>
              <div className="min-w-0 text-xs">
                <span className="block font-medium">{f.clase ? CLASE[f.clase] ?? f.clase : "—"}</span>
                <span className="block truncate text-muted-foreground">{f.proveedor ?? ""}</span>
              </div>
              <StatusPill tone={e.tono} size="sm">{e.texto}</StatusPill>
              <div className="min-w-0 text-xs">
                {f.comprobante_id ? (
                  <Link href={`/bandeja/${f.comprobante_id}`} className="font-medium text-primary hover:underline">Abrir {f.comprobante_numero}</Link>
                ) : f.remito_id ? <span>Remito cargado</span> : null}
                {f.motivo && <span className="block text-muted-foreground">{f.motivo}</span>}
                {f.estado === "revisar" && <Reprocesar id={f.id} />}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
