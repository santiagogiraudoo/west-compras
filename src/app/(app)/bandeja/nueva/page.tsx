import { prisma } from "@/lib/prisma";
import { listasDeCarga } from "@/lib/facturas/queries";
import { hoyArgentina } from "@/lib/cuenta/queries";
import { LECTURA_DISPONIBLE } from "@/lib/pagos/leer-comprobante";
import { TituloDePestana } from "@/components/layout/Breadcrumbs";
import { AnadirFactura } from "@/components/facturas/AnadirFactura";

export const dynamic = "force-dynamic";

/**
 * Añadir una factura a mano: se sube la foto o el PDF, la lee Claude, la app dice qué falta
 * y se completa. Queda pendiente en la Bandeja, como las que trae el plomero.
 */
export default async function NuevaFacturaPage() {
  const [listas, proveedores] = await Promise.all([
    listasDeCarga(),
    prisma.proveedor.findMany({ where: { activo: true }, select: { codigo: true, razon_social: true }, orderBy: { razon_social: "asc" } }),
  ]);
  return (
    <div className="mx-auto max-w-5xl space-y-5 px-8 py-6">
      <TituloDePestana label="Añadir factura" />
      <div>
        <h1 className="text-2xl font-bold text-primary">Añadir factura</h1>
        <p className="text-sm text-muted-foreground">
          Subí la foto o el PDF: la IA la lee y te dice qué falta. Completás lo que no pudo leer, se carga pendiente y la aprobás como
          cualquier otra. Lo normal sigue siendo que la traiga el plomero desde el mail.
        </p>
      </div>
      <AnadirFactura hoy={hoyArgentina()} conIA={LECTURA_DISPONIBLE()} proveedores={proveedores.map((p) => ({ value: p.codigo, label: p.razon_social }))}
        unidades={listas.unidades} titulares={listas.titulares} categorias={listas.categorias} />
    </div>
  );
}
