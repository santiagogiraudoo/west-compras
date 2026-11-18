import Link from "next/link";
import { CheckCircle, ChevronRight, CircleAlert, Clock, ExternalLink, Paperclip, TriangleAlert, XCircle, type LucideIcon } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { StatusPill } from "@/components/shared/StatusPill";
import { formatDate } from "@/lib/utils";
import { listarBandeja, type FilaBandeja } from "@/lib/facturas/queries";
import { diferenciaRemito } from "@/lib/op/estados";

export const dynamic = "force-dynamic";

type Grupo = "falta" | "excepcion" | "lista";

/** Los grupos de Cobros pendientes de alquileres: el encabezado teñido dice qué hay que hacer. */
const GRUPOS: { clave: Grupo; titulo: string; nota: string; icon: LucideIcon; cabeza: string; borde: string }[] = [
  { clave: "falta", titulo: "Le falta algo", nota: "Completá lo que dice cada una para poder aprobarla", icon: XCircle,
    cabeza: "bg-red-50 text-red-800", borde: "border-l-red-500" },
  { clave: "excepcion", titulo: "Excepción", nota: "Se aprueba igual explicando por qué", icon: CircleAlert,
    cabeza: "bg-amber-50 text-amber-900", borde: "border-l-amber-500" },
  { clave: "lista", titulo: "Lista para aprobar", nota: "Tiene todo: solo falta la firma", icon: CheckCircle,
    cabeza: "bg-[#f0f6f2] text-[#0f2a1f]", borde: "border-l-transparent" },
];

const COLS = "grid grid-cols-[80px_minmax(110px,1.1fr)_minmax(120px,1fr)_96px_minmax(170px,1.6fr)_16px] items-center gap-x-3";
const $ = (v: number, className?: string) => <MoneyCell value={v} currency="ARS" decimals={0} className={className} />;

const grupoDe = (f: FilaBandeja): Grupo =>
  f.requisitos.faltan.length > 0 ? "falta" : f.requisitos.excepciones.length > 0 ? "excepcion" : "lista";

/** El cruce factura ↔ remito, con la regla de la OP (tolerancia cero, contra total o neto). */
function cruce(f: FilaBandeja): { ok: boolean | null; texto: string } {
  if (f.remitos.length === 0) return f.retiro_por
    ? { ok: null, texto: `Sin remito: retiró ${f.retiro_por} (según la factura)` }
    : { ok: false, texto: "Sin remito ni quién recibió" };
  const conImporte = f.remitos.filter((r) => r.importe != null);
  if (conImporte.length === 0) return { ok: null, texto: "Los remitos no tienen importe: no se puede cruzar el monto" };
  const suma = conImporte.reduce((t, r) => t + (r.importe ?? 0), 0);
  const dif = diferenciaRemito({ remito_importe: suma.toFixed(2), factura_total: f.total.toFixed(2), factura_neto: f.neto.toFixed(2) });
  return dif ? { ok: false, texto: `No coincide: ${dif}` } : { ok: true, texto: "El importe de los remitos coincide con la factura" };
}

/**
 * Bandeja de facturas: solo las que no pasaron solas, agrupadas por lo que hay que hacer
 * (como los grupos de Cobros pendientes de alquileres). Cada fila se abre y muestra sus
 * remitos y si cruzan, con accesos al PDF, a los remitos y a la ficha.
 */
export default async function BandejaPage() {
  const filas = await listarBandeja();

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Bandeja de facturas</h1>
        <p className="text-sm text-muted-foreground">
          Las que esperan aprobación o tienen algo que frena. Tocá una para ver sus remitos y si cruzan; lo completo pasa solo.
        </p>
      </div>

      {filas.length === 0 ? (
        <div className="border border-border/60 rounded-lg bg-white p-12 text-center">
          <p className="text-sm text-muted-foreground">Nada en la bandeja.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-border/60 bg-white">
          <div className="min-w-[720px]">
            <div className={`${COLS} border-b bg-white px-4 py-2 text-xs font-semibold uppercase tracking-wide`} style={{ color: "#B8960C" }}>
              <span>Fecha</span><span>Proveedor</span><span>Comprobante</span><span className="text-right">Total</span><span>Qué tiene</span><span />
            </div>
            {GRUPOS.map((g) => {
              const lista = filas.filter((f) => grupoDe(f) === g.clave);
              if (lista.length === 0) return null;
              const total = lista.reduce((t, f) => t + f.total, 0);
              return (
                <section key={g.clave}>
                  <div className={`flex flex-wrap items-center gap-x-3 gap-y-1 border-b px-4 py-2.5 text-sm font-semibold ${g.cabeza}`}>
                    <g.icon className="h-4 w-4" />
                    {g.titulo}
                    <span className="font-normal opacity-80">— {lista.length} {lista.length === 1 ? "factura" : "facturas"} · </span>
                    {$(total, "font-semibold")}
                    <span className="ml-auto text-xs font-normal opacity-80">{g.nota}</span>
                  </div>
                  {lista.map((f) => <Fila key={f.id} f={f} borde={g.borde} lista={g.clave === "lista"} />)}
                </section>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function Fila({ f, borde, lista }: { f: FilaBandeja; borde: string; lista: boolean }) {
  const c = cruce(f);
  return (
    <details className={`group border-b border-l-4 last:border-b-0 ${borde}`}>
      <summary className={`${COLS} cursor-pointer list-none px-4 py-2.5 text-sm hover:bg-muted/30`}>
        <span>{formatDate(f.fecha)}</span>
        <span className="min-w-0 whitespace-normal">{f.proveedor}</span>
        <span className="font-medium text-primary">{f.tipo} {f.numero}</span>
        <span className="text-right">{$(f.total)}</span>
        <span className="flex flex-wrap gap-1">
          {f.requisitos.faltan.map((m) => <StatusPill key={m} tone="red" icon={TriangleAlert}>{m}</StatusPill>)}
          {f.requisitos.excepciones.map((m) => <StatusPill key={m} tone="amber" icon={CircleAlert}>{m}</StatusPill>)}
          {lista && f.estado === "Pendiente" && <StatusPill tone="amber" icon={Clock}>Sin aprobar</StatusPill>}
        </span>
        <ChevronRight className="h-4 w-4 text-muted-foreground/60 transition-transform group-open:rotate-90" />
      </summary>

      {/* Abierta: los remitos al lado de la factura, el cruce y los accesos */}
      <div className="grid gap-4 border-t bg-muted/20 px-6 py-4 xl:grid-cols-[minmax(0,1fr)_240px]">
        <div className="min-w-0 space-y-2">
          <p className={`inline-flex items-center gap-1.5 rounded-[4px] px-2 py-[3px] text-[12px] font-medium ${
            c.ok === true ? "bg-[#f0f6f2] text-[#0f2a1f]" : c.ok === false ? "bg-[#fef2f2] text-[#991b1b]" : "bg-[#fffbeb] text-[#92400e]"
          }`}>
            {c.ok === true ? <CheckCircle className="h-3.5 w-3.5" /> : <TriangleAlert className="h-3.5 w-3.5" />} {c.texto}
          </p>
          {f.remitos.length > 0 && (
            <div className="overflow-hidden rounded-md border bg-white">
              <div className="grid grid-cols-[minmax(120px,1fr)_90px_minmax(0,1.4fr)_110px_70px] gap-x-3 border-b bg-[#fafaf7] px-3 py-1.5 text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#8a8a85]">
                <span>Remito</span><span>Fecha</span><span>Retiró · autorizó</span><span className="text-right">Importe</span><span />
              </div>
              {f.remitos.map((r, i) => (
                <div key={i} className="grid grid-cols-[minmax(120px,1fr)_90px_minmax(0,1.4fr)_110px_70px] items-center gap-x-3 border-b px-3 py-2 text-[12.5px] last:border-b-0">
                  <span className="font-medium">{r.numero ?? "S/N"}</span>
                  <span className="text-[#525252]">{formatDate(r.fecha)}</span>
                  <span className="min-w-0 truncate text-[#525252]">{[r.retiro_por, r.autorizo && `autorizó ${r.autorizo}`].filter(Boolean).join(" · ") || "—"}</span>
                  <span className="text-right">{r.importe != null ? $(r.importe) : <span className="text-[#c4c3bd]">—</span>}</span>
                  <span className="text-right">
                    {r.archivo_link
                      ? <a href={r.archivo_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-0.5 font-medium text-primary hover:underline">Ver <ExternalLink className="h-3 w-3" /></a>
                      : <span className="text-[11px] text-[#a3a3a3]">sin archivo</span>}
                  </span>
                </div>
              ))}
            </div>
          )}
          <p className="text-[12px] text-[#8a8a85]">Factura: total {$(f.total)} · neto {$(f.neto)}</p>
        </div>

        <div className="flex flex-col gap-1.5 text-[13px]">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.08em] text-[#B8960C]">Accesos</p>
          {f.archivo_link
            ? <a href={f.archivo_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 font-medium text-primary hover:underline"><Paperclip className="h-3.5 w-3.5" /> PDF de la factura <ExternalLink className="h-3 w-3 opacity-60" /></a>
            : <span className="text-[#92400e]">Sin PDF todavía</span>}
          <Link href={`/cuenta/${f.proveedor_codigo}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Cuenta del proveedor <ChevronRight className="h-3.5 w-3.5" /></Link>
          <Link href={`/proveedores/${f.proveedor_codigo}`} className="inline-flex items-center gap-1 font-medium text-primary hover:underline">Ficha del proveedor <ChevronRight className="h-3.5 w-3.5" /></Link>
          <Link href={`/bandeja/${f.id}`} className="mt-2 inline-flex h-8 items-center justify-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[#163828]">
            Abrir la factura para {lista ? "aprobar" : "completar"} <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      </div>
    </details>
  );
}
