// Uso: npx tsx --env-file=.env scripts/extraer-cuentas.ts > sql/004_cuenta_proveedores_datos.sql
// Solo LEE cc.proveedores.cbu_alias y escribe por pantalla los UPDATE que separan el
// texto en cbu, alias, banco y cuenta_titular (con src/lib/proveedores/cuenta.ts).
// El .sql se revisa a mano y lo aplica el dueño de la base.
import pg from "pg";
import { separarCuenta } from "../src/lib/proveedores/cuenta";

const q = (s: string | null) => (s == null ? "null" : `'${s.replace(/'/g, "''")}'`);

async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  const { rows } = await client.query<{ codigo: string; cbu_alias: string }>(
    "select codigo, cbu_alias from cc.proveedores where cbu_alias is not null order by codigo");
  await client.end();
  console.log("-- Generado con scripts/extraer-cuentas.ts desde cc.proveedores.cbu_alias. Revisado a mano.");
  console.log("-- cbu_alias no se toca: queda como el texto original.");
  for (const r of rows) {
    const c = separarCuenta(r.cbu_alias);
    console.log(`update cc.proveedores set cbu = ${q(c.cbu)}, alias = ${q(c.alias)}, banco = ${q(c.banco)}, ` +
      `cuenta_titular = ${q(c.titular)} where codigo = '${r.codigo}';`);
  }
}
main();
