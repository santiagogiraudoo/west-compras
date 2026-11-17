// Uso: npm run usuario -- "Nombre" email@west.com admin
// Crea el usuario con una contraseña al azar y la imprime UNA vez.
import { randomBytes } from "node:crypto";
import bcrypt from "bcryptjs";
import pg from "pg";

const [name, email, role = "operador"] = process.argv.slice(2);
if (!name || !email) throw new Error('Uso: npm run usuario -- "Nombre" email rol');
const password = randomBytes(9).toString("base64url");
async function main() {
  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query(
    "insert into app.users (name, email, password_hash, role) values ($1, $2, $3, $4)",
    [name, email.toLowerCase(), await bcrypt.hash(password, 10), role],
  );
  await client.end();
  console.log(`Usuario ${email} (${role}) creado. Contraseña: ${password}`);
}
main();
