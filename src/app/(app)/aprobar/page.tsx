import { redirect } from "next/navigation";

/** Para aprobar ahora es el paso 2 de Órdenes de pago: los links viejos siguen andando. */
export default function AprobarPage() {
  redirect("/op?paso=aprobar");
}
