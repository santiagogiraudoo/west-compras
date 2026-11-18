import { prisma } from "@/lib/prisma";
import { listasDeCarga } from "@/lib/facturas/queries";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { FormExtraordinaria } from "@/components/op/FormExtraordinaria";

export const dynamic = "force-dynamic";

/**
 * Operación extraordinaria: una compra sin factura o un remito que se paga antes de su
 * factura. Se carga pendiente y después sigue el circuito de siempre (Bandeja → OP).
 */
export default async function ExtraordinariaPage() {
  const [listas, proveedores] = await Promise.all([
    listasDeCarga(),
    prisma.proveedor.findMany({ where: { activo: true }, select: { codigo: true, razon_social: true }, orderBy: { razon_social: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-3xl space-y-5 px-8 py-6">
      <TituloDePestana label="Operación extraordinaria" />
      <div>
        <h1 className="text-2xl font-bold text-primary">Operación extraordinaria</h1>
        <p className="text-sm text-muted-foreground">
          Para lo que no viene con una factura del plomero: una compra en negro o un remito que hay que pagar antes de que llegue su
          factura. Se carga pendiente y la aprueba quien corresponde en la Bandeja, con su motivo. Después se paga con una OP, como siempre.
        </p>
      </div>
      <FormExtraordinaria hoy={hoyArgentina()} proveedores={proveedores.map((p) => ({ value: p.codigo, label: p.razon_social }))}
        unidades={listas.unidades} titulares={listas.titulares} />
    </div>
  );
}
