import Link from "next/link";
import { notFound } from "next/navigation";
import { ExternalLink, History, Landmark, TriangleAlert } from "lucide-react";
import { auth } from "@/lib/auth";
import { formatDate } from "@/lib/utils";
import { SE_DESCARTA } from "@/lib/op/estados";
import { contextoProveedores, historialOP, listarConstancias, listarOPsApp, type EventoOP } from "@/lib/op/queries";
import { FichaCard } from "@/components/properties/FichaCard";
import { TarjetaOP } from "@/components/op/TarjetaOP";
import { EstadoOPBadge } from "@/components/op/EstadoOP";
import { AccionOP } from "@/components/op/AccionOP";
import { ConstanciasOP } from "@/components/op/ConstanciasOP";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";

export const dynamic = "force-dynamic";

/**
 * Ficha de una OP de la app: su tarjeta de aprobación a todo el ancho, la cuenta del
 * proveedor en una línea chica (es lo de menos para decidir) y las constancias.
 */
export default async function FichaOPPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const session = await auth();
  const usuario = { id: (session?.user as { id: number } | undefined)?.id ?? 0, role: session?.user?.role ?? "consulta" };
  const op = (await listarOPsApp()).find((o) => o.numero === decodeURIComponent(numero));
  if (!op) notFound();
  const [{ deuda, ultimas }, constancias, historial] = await Promise.all([
    contextoProveedores([op.proveedor_codigo]),
    listarConstancias(op.numero),
    historialOP(op.numero),
  ]);
  const edita = usuario.role !== "consulta";
  const cuenta = [
    op.cbu && { k: "CBU", v: op.cbu },
    op.alias && { k: "Alias", v: op.alias },
    op.banco && { k: "Banco", v: op.banco },
    op.cuenta_titular && { k: "Titular", v: op.cuenta_titular },
    op.cuit && { k: "CUIT", v: op.cuit },
  ].filter((x): x is { k: string; v: string } => !!x);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-8 pt-5 pb-8">
      <TituloDePestana label={op.numero} />

      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.015em] text-primary">{op.numero}</h1>
            <EstadoOPBadge estado={op.estado} size="md" />
          </div>
          <p className="mt-1 text-[12.5px] text-[#8a8a85]">
            Armada por {op.armada_por} el {formatDate(op.armada_en)}
            {op.enviada_en ? ` · mandada a aprobar por ${op.enviada_por} el ${formatDate(op.enviada_en)}` : ""}
          </p>
          <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-[#8a8a85]">
            <Landmark className="h-3.5 w-3.5" />
            {cuenta.length === 0 && <span>Sin cuenta cargada</span>}
            {cuenta.map((d) => <span key={d.k}>{d.k} <span className="tabular-nums text-[#404040]">{d.v}</span></span>)}
            {op.faltan.length > 0 && (
              <Link href={`/proveedores/${op.proveedor_codigo}`}
                className="inline-flex items-center gap-1 rounded-[4px] bg-[#fffbeb] px-1.5 py-px font-medium text-[#92400e] hover:underline">
                <TriangleAlert className="h-3 w-3" /> Falta {op.faltan.join(", ")}: completar el alta
              </Link>
            )}
          </p>
        </div>
        {edita && (
          <div className="flex flex-wrap gap-2">
            {SE_DESCARTA.includes(op.estado) && <AccionOP numero={op.numero} accion="descartar" />}
            {op.estado === "En armado" && <AccionOP numero={op.numero} accion="enviar" />}
            {op.estado === "Autorizada" && (
              <Link href="/op?paso=pagar" className="inline-flex h-8 items-center gap-1.5 rounded-md bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-[#163828]">
                Ir a pagar <ExternalLink className="h-3.5 w-3.5" />
              </Link>
            )}
          </div>
        )}
      </div>

      <TarjetaOP op={op} usuario={usuario} deuda={deuda[op.proveedor_codigo] ?? null} ultimas={ultimas[op.proveedor_codigo] ?? []} enFicha />

      <div className="grid gap-4 xl:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <ConstanciasOP numero={op.numero} constancias={constancias} sube={edita} />
        <Historial eventos={historial} />
      </div>
    </div>
  );
}

/** El color de cada paso, igual que el estado que deja (ver EstadoOP). */
const COLOR_PASO: Record<string, string> = {
  Armada: "bg-[#64748b]", "Mandada a aprobar": "bg-[#f59e0b]", Aprobada: "bg-[#1B4332]",
  Observada: "bg-[#ea580c]", Bloqueada: "bg-[#dc2626]", "Decisión quitada": "bg-[#a3a3a3]",
  "Factura sacada": "bg-[#a3a3a3]", Descartada: "bg-[#a3a3a3]",
};

/** La historia de la OP, la más nueva arriba: quién hizo qué y cuándo. */
function Historial({ eventos }: { eventos: EventoOP[] }) {
  return (
    <FichaCard icon={History} title="Historial" className="self-start"
      actions={<span className="text-xs text-white/75">{eventos.length}</span>}>
      {eventos.length === 0 ? (
        <p className="px-5 py-4 text-[13px] text-[#8a8a85]">Sin movimientos.</p>
      ) : (
        <ol className="relative px-5 py-4">
          {eventos.map((e, i) => (
            <li key={i} className="relative pb-4 pl-6 last:pb-0">
              {i < eventos.length - 1 && <span className="absolute left-[5px] top-3 h-full w-px bg-[#e8e8e3]" aria-hidden />}
              <span className={`absolute left-0 top-1.5 h-[11px] w-[11px] rounded-full ring-2 ring-white ${COLOR_PASO[e.que] ?? "bg-[#a3a3a3]"}`} aria-hidden />
              <p className="text-[13px]">
                <span className="font-semibold text-foreground">{e.que}</span>
                {e.quien && <span className="text-[#525252]"> · {e.quien}</span>}
              </p>
              {e.facturas.length > 0 && (
                <p className="text-[12px] text-[#8a8a85]">{e.facturas.length === 1 ? `Factura ${e.facturas[0]}` : `${e.facturas.length} facturas: ${e.facturas.join(", ")}`}</p>
              )}
              {e.detalle && <p className="text-[12.5px] text-[#525252]">{e.detalle}</p>}
              <p className="text-[11.5px] text-[#8a8a85]">{e.cuando}</p>
            </li>
          ))}
        </ol>
      )}
    </FichaCard>
  );
}
