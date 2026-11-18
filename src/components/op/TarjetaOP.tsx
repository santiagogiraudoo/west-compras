import Link from "next/link";
import { AlertTriangle, CheckCircle2, FileText } from "lucide-react";
import { MoneyCell } from "@/components/shared/MoneyCell";
import { formatDate } from "@/lib/utils";
import { chequeosOP, decide, SE_DECIDE, subasDePrecio, type LineaAprobacion } from "@/lib/op/estados";
import { vencimientoOP } from "@/lib/op/pago";
import type { CompraAnterior, OPConLineas } from "@/lib/op/queries";
import { EstadoOPBadge } from "./EstadoOP";
import { AccionOP } from "./AccionOP";

const $ = (v: string | null) => <MoneyCell value={Number(v ?? 0)} currency="ARS" decimals={2} />;

interface Props {
  op: OPConLineas;
  usuario: { id: number; role: string };
  deuda: string | null;
  ultimas: CompraAnterior[];
}

/**
 * Tarjeta de aprobación (doc "Lo que ve quien aprueba"): una línea arriba, los chequeos
 * en verde o amarillo, la tabla de la OP y los botones. Lo demás, en "Ver más".
 * Quien aprueba ve sus renglones arriba y los de los demás en gris, con su estado.
 */
export function TarjetaOP({ op, usuario, deuda, ultimas }: Props) {
  const mias = op.lineas.filter((l) => decide(l, usuario));
  const otras = op.lineas.filter((l) => !decide(l, usuario));
  const chequeos = chequeosOP(op.lineas, op.faltan);
  const subas = subasDePrecio(op.lineas);
  const unidades = [...new Set(op.lineas.map((l) => l.unidad_nombre || l.unidad))].join(", ");
  const vence = vencimientoOP(op.lineas);
  const puede = usuario.role !== "consulta" && mias.length > 0 && SE_DECIDE.includes(op.estado);
  const pendientes = mias.filter((l) => l.decision !== "Aprobada").length;

  return (
    <article className="rounded-md border bg-card text-sm">
      <header className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b px-4 py-3">
        <div className="flex flex-wrap items-baseline gap-x-3">
          <Link href={`/cuenta/${op.proveedor_codigo}`} className="font-semibold text-primary hover:underline">{op.razon_social}</Link>
          <span className="text-base font-semibold">{$(op.total_imputado)}</span>
          <span>{unidades}</span>
          <span className="text-muted-foreground">vence {vence ? formatDate(vence) : "—"}</span>
        </div>
        <div className="flex items-baseline gap-2 text-xs text-muted-foreground">
          {op.numero} <EstadoOPBadge estado={op.estado} />
        </div>
      </header>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 border-b px-4 py-2 text-xs">
        {chequeos.map((c) => (
          <li key={c.clave} className={`inline-flex items-center gap-1 ${c.ok ? "text-emerald-800" : "font-medium text-amber-800"}`}>
            {c.ok ? <CheckCircle2 className="h-3.5 w-3.5" /> : <AlertTriangle className="h-3.5 w-3.5" />} {c.texto}
          </li>
        ))}
      </ul>

      <div className="overflow-x-auto">
        <table className="w-full [&_td]:whitespace-nowrap">
          <thead className="text-left text-xs text-muted-foreground">
            <tr>
              <th className="px-4 py-2">Factura</th><th className="px-2">Fecha → Vto.</th><th className="px-2">Quién</th>
              <th className="px-2">Para qué</th><th className="px-2">Unidad</th><th className="px-2 text-right">Monto</th><th className="px-4">Renglón</th>
            </tr>
          </thead>
          <tbody>
            {[...mias, ...otras].map((l) => <Renglon key={l.id} l={l} mio={mias.includes(l)} />)}
          </tbody>
        </table>
      </div>

      <footer className="flex flex-wrap items-center justify-between gap-2 border-t px-4 py-3">
        <details className="group text-xs [&_summary]:cursor-pointer">
          <summary className="text-primary underline-offset-2 hover:underline">Ver más</summary>
          <VerMas op={op} subas={subas} deuda={deuda} ultimas={ultimas} />
        </details>
        {puede ? (
          <div className="flex flex-wrap gap-2">
            {pendientes > 0 && <AccionOP numero={op.numero} accion="aprobar" />}
            <AccionOP numero={op.numero} accion="observar" />
            <AccionOP numero={op.numero} accion="bloquear" />
          </div>
        ) : (
          <span className="text-xs text-muted-foreground">{mias.length === 0 ? "Ningún renglón es de una unidad tuya" : ""}</span>
        )}
      </footer>
    </article>
  );
}

function Renglon({ l, mio }: { l: LineaAprobacion; mio: boolean }) {
  const estado =
    l.decision === "Aprobada" ? <span className="text-emerald-800">Aprobado por {l.usuario}</span>
    : l.decision ? <span className={l.decision === "Bloqueada" ? "text-red-700" : "text-orange-800"}>{l.decision} por {l.usuario}: {l.motivo}</span>
    : <span className="text-muted-foreground">Esperando a {l.aprobador ?? "un admin"}</span>;
  return (
    <tr className={`border-t align-top ${mio ? "" : "text-muted-foreground"}`}>
      <td className="px-4 py-1.5">
        {l.archivo_link ? (
          <a href={l.archivo_link} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary hover:underline">
            <FileText className="h-3.5 w-3.5" /> {l.tipo} {l.numero}
          </a>
        ) : <>{l.tipo} {l.numero}</>}
      </td>
      <td className="px-2 py-1.5">{formatDate(l.fecha)} → {l.vencimiento ? formatDate(l.vencimiento) : "—"}</td>
      <td className="px-2 py-1.5">{l.quien ?? "—"}</td>
      <td className="max-w-[260px] truncate px-2 py-1.5" title={l.para_que ?? ""}>{l.para_que ?? "—"}</td>
      <td className="px-2 py-1.5">{l.unidad_nombre || l.unidad}</td>
      <td className="px-2 py-1.5 text-right">{$(l.importe)}</td>
      <td className="max-w-[280px] truncate px-4 py-1.5 text-xs" title={l.motivo ?? ""}>{estado}</td>
    </tr>
  );
}

function VerMas({ op, subas, deuda, ultimas }: {
  op: OPConLineas; subas: ReturnType<typeof subasDePrecio>; deuda: string | null; ultimas: CompraAnterior[];
}) {
  return (
    <div className="mt-3 grid gap-4 text-sm md:grid-cols-2">
      <section>
        <h3 className="mb-1 text-xs font-medium text-muted-foreground">Ítems</h3>
        {op.lineas.every((l) => !l.items?.length) ? <p className="text-muted-foreground">Sin ítems cargados.</p> : (
          <table className="w-full text-xs">
            <tbody>
              {op.lineas.flatMap((l) => (l.items ?? []).map((it, i) => (
                <tr key={`${l.id}-${i}`} className="border-t">
                  <td className="py-1 pr-2">{it.descripcion}</td>
                  <td className="py-1 pr-2 text-right">{it.cantidad ?? ""}</td>
                  <td className="py-1 pr-2 text-right">{it.precio ? $(it.precio) : ""}</td>
                  <td className="py-1 text-right text-muted-foreground">
                    {it.anterior ? <>antes {$(it.anterior)}{it.anterior_fecha ? ` (${formatDate(it.anterior_fecha)})` : ""}</> : ""}
                  </td>
                </tr>
              )))}
            </tbody>
          </table>
        )}
        {subas.length > 0 && (
          <ul className="mt-2 text-xs text-amber-800">
            {subas.map((s, i) => <li key={i}>• {s.descripcion}: +{s.pct.replace(".", ",")} % ({s.factura})</li>)}
          </ul>
        )}
      </section>
      <section className="space-y-3">
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Cuenta corriente</h3>
          <p>Deuda con el proveedor: {$(deuda)} · <Link href={`/cuenta/${op.proveedor_codigo}`} className="text-primary underline">ver extracto</Link></p>
        </div>
        <div>
          <h3 className="mb-1 text-xs font-medium text-muted-foreground">Últimas compras al proveedor</h3>
          <ul className="text-xs">
            {ultimas.map((c) => (
              <li key={c.numero} className="flex justify-between gap-2"><span>{formatDate(c.fecha)} · {c.tipo} {c.numero}</span>{$(c.total)}</li>
            ))}
          </ul>
        </div>
        <p className="text-xs text-muted-foreground">
          Armada por {op.armada_por}{op.enviada_en ? ` · mandada a aprobar por ${op.enviada_por} el ${formatDate(op.enviada_en.slice(0, 10))}` : ""} · titular {op.titular ?? "—"}
        </p>
      </section>
    </div>
  );
}
