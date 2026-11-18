import { notFound } from "next/navigation";
import { auth } from "@/lib/auth";
import { contextoProveedores, listarOPsApp } from "@/lib/op/queries";
import { TarjetaOP } from "@/components/op/TarjetaOP";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";

export const dynamic = "force-dynamic";

/** Ficha de una OP de la app: su tarjeta de aprobación. */
export default async function FichaOPPage({ params }: { params: Promise<{ numero: string }> }) {
  const { numero } = await params;
  const session = await auth();
  const usuario = { id: (session?.user as { id: number } | undefined)?.id ?? 0, role: session?.user?.role ?? "consulta" };
  const op = (await listarOPsApp()).find((o) => o.numero === decodeURIComponent(numero));
  if (!op) notFound();
  const { deuda, ultimas } = await contextoProveedores([op.proveedor_codigo]);

  return (
    <div className="mx-auto flex max-w-[1400px] flex-col gap-4 px-8 pt-5 pb-8">
      <TituloDePestana label={op.numero} />
      <TarjetaOP op={op} usuario={usuario} deuda={deuda[op.proveedor_codigo] ?? null} ultimas={ultimas[op.proveedor_codigo] ?? []} />
    </div>
  );
}
