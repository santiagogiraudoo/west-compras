"use server";

import { revalidatePath } from "next/cache";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { proximoCodigo, validarAlta, type AltaProveedor, type ErroresAlta } from "@/lib/proveedores/validar";
import { armarTextoCuenta } from "@/lib/proveedores/cuenta";

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


  // La cuenta va en sus campos. Si cambió, también se reescribe el texto de cbu_alias,
  // que siguen leyendo cc.v_alertas, el plomero y las OP de ClickUp: si no, una OP podría
  // salir con el CBU viejo. Si no cambió, el texto original (con su fuente) queda igual.
  const cuenta = {
    cbu: limpio.cbu.trim() || null, alias: limpio.alias.trim() || null,
    banco: limpio.banco.trim() || null, titular: limpio.cuentaTitular.trim() || null,
  };
  const antes = codigo
    ? await prisma.proveedor.findUnique({ where: { codigo }, select: { cbu: true, alias: true, banco: true, cuenta_titular: true } })
    : null;
  const cambioCuenta = !antes || antes.cbu !== cuenta.cbu || antes.alias !== cuenta.alias
    || antes.banco !== cuenta.banco || antes.cuenta_titular !== cuenta.titular;

  // Cambiar la cuenta de un proveedor con OP ya mandadas a aprobar o autorizadas es
  // cambiar a dónde va una plata que ya se firmó: solo un admin. Si no, un operador podría
  // cambiar el CBU y registrar él mismo el pago sin que nadie lo vuelva a ver.
  if (codigo && antes && cambioCuenta && session.user.role !== "admin") {
    const [{ vivas }] = await prisma.$queryRaw<{ vivas: string | null }[]>`
      select string_agg(e.op_numero, ', ') as vivas
      from app.v_op_estado e join cc.ordenes_pago o on o.numero = e.op_numero
      where o.proveedor_codigo = ${codigo} and e.estado in ('A aprobar', 'Observada', 'Bloqueada', 'Autorizada')`;
    if (vivas) {
      return { ok: false, mensaje: `Tiene OP en curso (${vivas}): solo un admin puede cambiarle la cuenta bancaria.`, errores: { cbu: "Cuenta con OP en curso" } };
    }
  }

  const filaDe = (cod: string) => ({
    Codigo: cod,
    "Razon social": limpio.razonSocial,
    CUIT: limpio.cuit,
    "Cond. IVA": limpio.condicionIva,
    "Rubro principal": limpio.rubro,
    "Condicion de pago": limpio.condicionPago.trim(),
    "Plazo (dias)": limpio.plazoDias.trim() || null,
    "Medio de pago habitual": limpio.medioPago,
    CBU: cuenta.cbu,
    Alias: cuenta.alias,
    Banco: cuenta.banco,
    "Titular cuenta": cuenta.titular,
    ...(cambioCuenta ? { "CBU / Alias": armarTextoCuenta(cuenta) } : {}),
    Telefono: limpio.telefono,
    Email: limpio.email.trim() || null,
    Contacto: limpio.contacto.trim() || null,
  });

  // Dos altas a la vez tomaban el mismo PR y la segunda pisaba a la primera (el upsert es
  // por código). Con el lock, la segunda espera; adentro se vuelven a mirar el próximo
  // código libre y el CUIT repetido. $executeRaw: la función devuelve void.
  let cod = codigo ?? "";
  let r: { proveedores: number; errores: { error: string }[] };
  try {
    r = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`select pg_advisory_xact_lock(hashtext('alta-proveedor'))`;
      const [repetido] = await tx.$queryRaw<{ codigo: string; razon_social: string }[]>`
        select codigo, razon_social from cc.proveedores where cuit = ${limpio.cuit} and codigo is distinct from ${codigo} limit 1`;
      if (repetido) throw new Error(`Ese CUIT ya es de ${repetido.codigo} · ${repetido.razon_social}.`);
      if (!codigo) cod = proximoCodigo((await tx.$queryRaw<{ codigo: string }[]>`select codigo from cc.proveedores`).map((p) => p.codigo));
      const [{ r }] = await tx.$queryRaw<{ r: { proveedores: number; errores: { error: string }[] } }[]>`
        select cc.cargar_nuevos(${JSON.stringify({ proveedores: [filaDe(cod)], comprobantes: [] })}::jsonb, 'app') as r`;
      return r;
    });
  } catch (e) {
    const mensaje = e instanceof Error ? e.message : String(e);
    return mensaje.startsWith("Ese CUIT") ? { ok: false, mensaje, errores: { cuit: "CUIT repetido" } } : { ok: false, mensaje: `La base lo rechazó: ${mensaje}` };
  }

  if (r.errores?.length) return { ok: false, mensaje: `La base lo rechazó: ${r.errores.map((x) => x.error).join(" · ")}` };
  if (r.proveedores !== 1) return { ok: false, mensaje: "La base no guardó el proveedor." };

  revalidatePath("/proveedores");
  revalidatePath("/bandeja");
  revalidatePath("/");
  return { ok: true, mensaje: `${codigo ? "Guardado" : "Dado de alta"}: ${cod} · ${limpio.razonSocial}`, codigo: cod };
}
