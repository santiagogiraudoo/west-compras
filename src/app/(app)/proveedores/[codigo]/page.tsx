import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
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
    <div className="mx-auto max-w-4xl space-y-4">
      <Link href="/proveedores" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-primary">
        <ArrowLeft className="h-4 w-4" /> Proveedores
      </Link>
      <div>
        <h1 className="text-xl font-semibold text-primary">
          {esNuevo ? "Nuevo proveedor" : `${p!.codigo} · ${p!.razon_social}`}
        </h1>
        {!esNuevo && (
          <p className="text-sm text-muted-foreground">
            {faltan.length === 0 ? "Alta completa." : `Le falta: ${faltan.join(", ")}.`}{" "}
            <Link href={`/cuenta/${codigo}`} className="text-primary underline-offset-2 hover:underline">Ver cuenta corriente</Link>
          </p>
        )}
      </div>
      <ProveedorForm codigo={esNuevo ? null : codigo} inicial={inicial} rubros={rubros.map((r) => r.nombre)} textoCuenta={p?.cbu_alias} />
    </div>
  );
}
