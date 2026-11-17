import "dotenv/config";
import { defineConfig } from "prisma/config";

// La app NO hace migraciones con Prisma todavía: el esquema `cc` es de la base
// de proveedores (lo escriben el plomero y sus funciones SQL) y el esquema `app`
// se arma con los .sql de la carpeta sql/. Prisma solo lee lo que hay (db pull).
// DIRECT_URL (dueño de la base) se usa solo para db pull; la app corre con DATABASE_URL.
export default defineConfig({
  schema: "prisma/schema.prisma",
  datasource: {
    url: process.env["DIRECT_URL"] ?? process.env["DATABASE_URL"],
  },
});
