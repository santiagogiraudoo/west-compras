"use server";

import { auth } from "@/lib/auth";
import { buscar, type Resultado } from "@/lib/buscar/queries";

/** El buscador de arriba (solo lee). Hace falta estar adentro de la app. */
export async function buscarTodo(q: string): Promise<Resultado[]> {
  const session = await auth();
  if (!session?.user) return [];
  return buscar(q.slice(0, 80));
}
