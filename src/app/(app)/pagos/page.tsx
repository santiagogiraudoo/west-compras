import { redirect } from "next/navigation";

/** Para pagar ahora es el paso 3 de Órdenes de pago: los links viejos siguen andando. */
export default function PagosPage() {
  redirect("/op?paso=pagar");
}
