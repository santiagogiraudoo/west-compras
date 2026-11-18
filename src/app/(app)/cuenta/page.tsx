import { DeudaPorProveedor } from "@/components/cuenta/DeudaPorProveedor";
import { resumirDeuda } from "@/lib/cuenta/calculos";
import { hoyArgentina, listarAbiertos } from "@/lib/cuenta/queries";

export const dynamic = "force-dynamic";

/** Cuentas corrientes: a quién se le debe. Tocar un proveedor abre su extracto. */
export default async function CuentasPage() {
  const hoy = hoyArgentina();
  const t = resumirDeuda(await listarAbiertos(), hoy);
  return (
    <div className="px-8 py-6 space-y-6 max-w-[1400px] mx-auto">
      <div>
        <h1 className="text-2xl font-bold text-primary">Cuentas corrientes</h1>
        <p className="text-sm text-muted-foreground">
          Proveedores con facturas aprobadas sin pagar. La cuenta de cualquier proveedor se abre desde su ficha.
        </p>
      </div>
      <DeudaPorProveedor filas={t.porProveedor} hoy={hoy} />
    </div>
  );
}
