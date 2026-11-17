"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { proximoCodigo, validarAlta, type AltaProveedor, type ErroresAlta } from "@/lib/proveedores/validar";

export interface ResultadoProveedor {
  ok: boolean;
  mensaje: string;
  errores?: ErroresAlta;
  codigo?: string;
}

/**
 * Alta o edición de un proveedor. Escribe con cc.cargar_nuevos({proveedores}),
 * igual que el plomero: la base hace el upsert por código y lo audita.
 * Sin `codigo` es un alta: toma el próximo PR libre.
 */
export async function guardarProveedor(codigo: string | null, datos: AltaProveedor): Promise<ResultadoProveedor> {
  const session = await auth();
  if (!session?.user || session.user.role === "consulta") {
    return { ok: false, mensaje: "No tenés permiso para editar proveedores." };
  }

  const { errores, limpio } = validarAlta(datos);
  if (Object.keys(errores).length > 0) return { ok: false, mensaje: "Revisá los datos marcados.", errores };

  // El mismo CUIT no puede estar dos veces (otro código ya lo tiene).
  const mismoCuit = await prisma.proveedor.findFirst({
    where: { cuit: limpio.cuit, ...(codigo ? { codigo: { not: codigo } } : {}) },
    select: { codigo: true, razon_social: true },
  });
  if (mismoCuit) {
    return { ok: false, mensaje: `Ese CUIT ya es de ${mismoCuit.codigo} · ${mismoCuit.razon_social}.`, errores: { cuit: "CUIT repetido" } };
  }

  const cod = codigo ?? proximoCodigo((await prisma.proveedor.findMany({ select: { codigo: true } })).map((p) => p.codigo));

  const fila = {
    Codigo: cod,
    "Razon social": limpio.razonSocial,
    CUIT: limpio.cuit,
    "Cond. IVA": limpio.condicionIva,
    "Rubro principal": limpio.rubro,
    "Condicion de pago": limpio.condicionPago.trim(),
    "Plazo (dias)": limpio.plazoDias.trim() || null,
    "Medio de pago habitual": limpio.medioPago,
    "CBU / Alias": limpio.cbuAlias.trim() || null,
    Telefono: limpio.telefono,
    Email: limpio.email.trim() || null,
    Contacto: limpio.contacto.trim() || null,
  };

  const [{ r }] = await prisma.$queryRaw<{ r: { proveedores: number; errores: { error: string }[] } }[]>`
    select cc.cargar_nuevos(${JSON.stringify({ proveedores: [fila], comprobantes: [] })}::jsonb, 'app') as r`;

  if (r.errores?.length) return { ok: false, mensaje: `La base lo rechazó: ${r.errores.map((x) => x.error).join(" · ")}` };
  if (r.proveedores !== 1) return { ok: false, mensaje: "La base no guardó el proveedor." };

  revalidatePath("/proveedores");
  revalidatePath("/bandeja");
  revalidatePath("/");
  return { ok: true, mensaje: `${codigo ? "Guardado" : "Dado de alta"}: ${cod} · ${limpio.razonSocial}`, codigo: cod };
}
