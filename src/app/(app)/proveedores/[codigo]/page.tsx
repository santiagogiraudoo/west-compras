import Link from "next/link";
import { notFound } from "next/navigation";
import { BookOpen, CheckCircle, TriangleAlert } from "lucide-react";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { StatusPill } from "@/components/shared/StatusPill";
import { prisma } from "@/lib/prisma";
import { faltantesProveedor } from "@/lib/facturas/requisitos";
import type { AltaProveedor } from "@/lib/proveedores/validar";
import { ProveedorForm } from "../ProveedorForm";

export const dynamic = "force-dynamic";

/** Ficha del proveedor para completar el alta. `/proveedores/nuevo` es un alta. */
export default async function ProveedorPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const esNuevo = codigo === "nuevo";
  const [p, rubros] = await Promise.all([
    esNuevo ? null : prisma.proveedor.findUnique({ where: { codigo } }),
    prisma.$queryRaw<{ nombre: string }[]>`select nombre from cc.rubros where activo order by nombre`,
  ]);
  if (!esNuevo && !p) notFound();

  const inicial: AltaProveedor = {
    razonSocial: p?.razon_social ?? "",
    cuit: p?.cuit ?? "",
    // "Resp. Inscripto" es una forma vieja de escribir lo mismo.
    condicionIva: p?.condicion_iva === "Resp. Inscripto" ? "Responsable Inscripto" : (p?.condicion_iva ?? ""),
    cbu: p?.cbu ?? "",
    alias: p?.alias ?? "",
    banco: p?.banco ?? "",
    cuentaTitular: p?.cuenta_titular ?? "",
    telefono: p?.telefono ?? "",
    rubro: p?.rubro ?? "",
    condicionPago: p?.condicion_pago ?? "",
    plazoDias: p?.plazo_dias != null ? String(p.plazo_dias) : "",
    medioPago: p?.medio_pago_habitual ?? "",
    email: p?.email ?? "",
    contacto: p?.contacto ?? "",
  };
  const faltan = p ? faltantesProveedor(p) : [];

  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      {!esNuevo && <TituloDePestana label={p!.razon_social} />}
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h1 className="text-2xl leading-[30px] font-semibold tracking-[-0.015em] text-primary">
              {esNuevo ? "Nuevo proveedor" : p!.razon_social}
            </h1>
            {!esNuevo && (
              faltan.length === 0
                ? <StatusPill tone="success" icon={CheckCircle} size="md">Alta completa</StatusPill>
                : <StatusPill tone="amber" icon={TriangleAlert} size="md">Le falta {faltan.length === 1 ? "1 dato" : `${faltan.length} datos`}</StatusPill>
            )}
          </div>
          <p className="mt-1 text-[13.5px] text-[#525252]">
            {esNuevo ? "Con los datos marcados ya se le puede pagar." : <>{p!.codigo}{p!.cuit ? ` · CUIT ${p!.cuit}` : ""}{faltan.length > 0 ? ` · falta ${faltan.join(", ")}` : ""}</>}
          </p>
        </div>
        {!esNuevo && (
          <Link href={`/cuenta/${codigo}`}
            className="inline-flex h-[34px] items-center gap-1.5 rounded-[8px] border border-border bg-white px-3.5 text-[13px] font-medium text-[#404040] hover:bg-muted">
            <BookOpen className="h-4 w-4" /> Cuenta corriente
          </Link>
        )}
      </div>
      <ProveedorForm codigo={esNuevo ? null : codigo} inicial={inicial} rubros={rubros.map((r) => r.nombre)} textoCuenta={p?.cbu_alias} />
    </div>
  );
}
