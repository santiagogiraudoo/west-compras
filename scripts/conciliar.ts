/**
 * Corre el conciliador (src/lib/entrada/conciliar.ts) contra la base del .env.
 *
 *   npm run conciliar              → dice qué ataría (no toca nada)
 *   npm run conciliar -- --aplicar → lo hace, con las funciones de la base
 *   npm run conciliar -- PR-004    → solo ese proveedor
 */
import { conciliar } from "../src/lib/entrada/conciliar.server";
import { prisma } from "../src/lib/prisma";

async function main() {
  const aplicar = process.argv.includes("--aplicar");
  const proveedor = process.argv.slice(2).find((x) => /^PR-\d+$/i.test(x)) ?? null;
  const r = await conciliar({ proveedor, aplicar });
  const cuenta = (t: string) => r.acciones.filter((a) => a.tipo === t).length;
  console.log(`${r.proveedores} proveedores con algo abierto · ${r.acciones.length} acciones${aplicar ? "" : " (en seco)"}`);
  console.log(`  remito → factura: ${cuenta("ligar_factura")} · remito → compra: ${cuenta("atar_compra")} · compra nueva: ${cuenta("crear_compra")}`);
  for (const a of r.acciones) {
    const que = a.tipo === "ligar_factura" ? `remito ${a.remito} → factura ${a.factura}` : a.tipo === "atar_compra" ? `remito ${a.remito} → compra ${a.compra}` : `remito ${a.remito} → compra nueva`;
    console.log(`  ${a.proveedor} · ${que} (${a.por})${a.error ? ` · ERROR: ${a.error}` : ""}`);
  }
}

main().catch((e) => { console.error(e instanceof Error ? e.message : e); process.exitCode = 1; }).finally(() => prisma.$disconnect());
