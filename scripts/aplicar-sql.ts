/**
 * Aplica los sql/ que le faltan a una base y los anota en app.migraciones (sql/015).
 *
 *   npx tsx scripts/aplicar-sql.ts            → muestra qué falta (no toca nada)
 *   npx tsx scripts/aplicar-sql.ts --aplicar  → aplica lo que falta, en orden
 *
 * La conexión es la del dueño de la base, en la variable OWNER_URL (nunca en el repo).
 * Cada archivo va en su propia transacción: si falla, ese no queda y no sigue.
 * Si un archivo ya aplicado cambió (otra huella), avisa y no aplica nada: un sql/
 * aplicado no se edita, se agrega otro.
 */
import { createHash } from "node:crypto";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

const DIR = join(__dirname, "..", "sql");
/** Los anteriores al registro los anota sql/015 sin huella. */
const PRIMERO_CON_REGISTRO = "015";

const huella = (txt: string) => createHash("sha256").update(txt.replace(/\r\n/g, "\n")).digest("hex");

async function main() {
  const url = process.env.OWNER_URL;
  if (!url) throw new Error("Falta OWNER_URL (conexión del dueño de la base)");
  const aplicar = process.argv.includes("--aplicar");
  const db = new Client({ connectionString: url });
  await db.connect();
  try {
    const { rows: [{ hay }] } = await db.query(`select to_regclass('app.migraciones') is not null as hay`);
    const hechos = new Map<string, string | null>(
      hay ? (await db.query(`select archivo, huella from app.migraciones`)).rows.map((r) => [r.archivo, r.huella]) : [],
    );
    const archivos = readdirSync(DIR).filter((f) => /^\d{3}_.*\.sql$/.test(f)).sort();
    const pendientes: string[] = [];
    const cambiados: string[] = [];
    for (const f of archivos) {
      const h = huella(readFileSync(join(DIR, f), "utf8"));
      if (hechos.has(f)) {
        const antes = hechos.get(f);
        if (antes && antes !== h) cambiados.push(f);
      } else if (!hay && f < PRIMERO_CON_REGISTRO) {
        // Base sin registro todavía: lo anterior a 015 ya está, lo anota el propio 015.
      } else {
        pendientes.push(f);
      }
    }
    const enBaseNoEnRepo = [...hechos.keys()].filter((f) => !archivos.includes(f));

    if (cambiados.length) console.log(`Cambiaron después de aplicados (no se edita un sql/ aplicado): ${cambiados.join(", ")}`);
    if (enBaseNoEnRepo.length) console.log(`Aplicados en la base y no en esta rama: ${enBaseNoEnRepo.join(", ")}`);
    console.log(pendientes.length ? `Faltan: ${pendientes.join(", ")}` : "No falta ninguno.");
    if (!aplicar || !pendientes.length) return;
    if (cambiados.length) throw new Error("Hay archivos cambiados: no se aplica nada.");

    for (const f of pendientes) {
      const txt = readFileSync(join(DIR, f), "utf8");
      await db.query("begin");
      try {
        await db.query(txt);
        await db.query(
          `insert into app.migraciones (archivo, huella) values ($1, $2)
           on conflict (archivo) do update set huella = excluded.huella, aplicado_en = now()`,
          [f, huella(txt)],
        );
        await db.query("commit");
        console.log(`Aplicado ${f}`);
      } catch (e) {
        await db.query("rollback");
        throw new Error(`${f}: ${(e as Error).message}`);
      }
    }
  } finally {
    await db.end();
  }
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
