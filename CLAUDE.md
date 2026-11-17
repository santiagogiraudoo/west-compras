# CLAUDE.md — West · App de compras y pagos

App de compras, facturas, remitos, cuenta corriente y pagos a proveedores de West.
Se arma en este repo aparte y **después se une a la app de alquileres**
(santiagogiraudoo/west-desarrolladora) como otra sección después del login. Por eso
todo lo de abajo copia las reglas de esa app: lo que se escribe acá tiene que poder
mudarse allá sin reescribirse.

## Cómo pensar antes de escribir código
Leé `docs/politica-de-simplicidad.md` (copiada de la app de alquileres): simplificar al
máximo, derivar en vez de guardar, una regla pareja antes que una excepción.

## Stack (igual que la app de alquileres, no negociable)
- Next.js 16 + TypeScript · Prisma 7 + PostgreSQL · npm
- Tailwind + shadcn/ui · NextAuth (usuario y contraseña) con roles admin, operador, consulta
- decimal.js para dinero, server-side, nunca floats · UI en español argentino, código en inglés
- Tests: vitest (`npm test`)
- Solo para compu (decisión de Adriano, 17/11)

## La base de datos
- **Proyecto Neon west-cc** (el de la cuenta corriente de proveedores).
  - Esquema `cc`: lo escriben el plomero (santiagogiraudoo/west-plomero) y las funciones
    SQL `cc.cargar_nuevos`, `cc.cargar_items`, `cc.cargar_pagos`. **La app escribe en `cc`
    solo a través de esas funciones**, así la base sigue frenando factura repetida, total
    que no cierra y doble pago. Nunca INSERT/UPDATE directo en `cc`.
  - Esquema `app`: lo propio de esta app (usuarios, y más adelante OC, aprobaciones,
    topes). Se crea con los archivos de `sql/`, numerados, en orden.
- **Desarrollo: rama `dev-app-compras`** (br-blue-violet-b695flm2), copia de production
  del 17/11. Nunca apuntar la app a `production` sin OK de Adriano.
- Roles: `app_compras` (la app: lee todo, inserta/actualiza, no borra, ejecuta funciones)
  y el dueño (solo para aplicar `sql/` y leer el esquema).
- **No se migra con Prisma.** `prisma/schema.prisma` refleja la base, no la manda.
  Los modelos de `cc` están escritos a mano desde information_schema y llevan los
  nombres de columnas tal cual. Al cambiar la base: primero el `.sql`, después el modelo.
- Para leer las alertas se usan las vistas `cc.v_alertas` y `cc.v_calidad` con
  `$queryRaw`: la app no reinventa reglas que ya están en la base.

## Entorno de Claude (sesiones en la nube)
- `binaries.prisma.sh` está bloqueado: generar el cliente con
  `PRISMA_SCHEMA_ENGINE_BINARY=/bin/true npx prisma generate`. `prisma db pull` no anda acá.
- Desde la nube no se llega a Neon por red: los datos se consultan con el conector de
  Neon y la app se prueba en el preview de Vercel.
- `npm install` falla por un bug de npm con los peers: instalar con `--ignore-scripts`
  usando el package-lock.json.

## UI
- Design system de la app de alquileres en `docs/design-system/README.html`: off-white
  `#FFFEFC`, verde `#1B4332`, dorado `#B8960C`. Dinero siempre con `<MoneyCell>`.
- Botones `size="sm"` con icono lucide antes del texto. No inventar primitivos nuevos.
- Montos en formato argentino ($1.234.567,89).

## Reglas del negocio (de Adriano, 17/11; detalle en docs/)
- Se aprueba una sola vez: si la compra estaba dentro del tope y la factura cruza con
  la compra y el remito, no pide otra firma.
- OP con facturas de varias unidades: cada línea la aprueba quien aprueba su unidad;
  **una línea observada frena toda la OP**.
- Factura sin remito: siempre excepción. Compra sin factura (en negro): aprobación sí o
  sí, o pago en el momento. Anticipos: no se hacen.
- No hay CC mensual: la OP la arma Adriano eligiendo facturas aprobadas.
- Alta de proveedor obligatoria antes de pagar: CUIT y razón social, CBU con titular
  verificado, WhatsApp, rubro y condiciones de pago.
- "Chilín" se registra como "Ramos Eduardo".

## Commits
- `type(scope): descripción corta en minúsculas`, atómicos, mensaje con el porqué.
- Nunca `--amend`, `--no-verify` ni `git add -A` sin revisar.
