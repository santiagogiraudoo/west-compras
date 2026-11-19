# 11 · Modo espejo: la app al lado de ClickUp (19/11)

ClickUp (con el plomero) sigue siendo lo que opera. La app corre al lado, en la base de
desarrollo, con los mismos datos, para medir qué falta antes de pasarse.

## 1. Datos al día
La base de la app en desarrollo es la rama Neon `dev-app-compras`, copia de production.
Para que el espejo mire lo de hoy:
1. Neon → proyecto west-cc → rama `dev-app-compras` → **Reset from parent**. Trae todo lo de
   production y **borra lo que se cargó solo en dev** (pruebas, lo que entró por el Buzón).
2. Aplicar lo de la app que production todavía no tiene:
   ```
   npm run sql              # dice qué falta (OWNER_URL del .env, dueño de la rama dev)
   npm run sql -- --aplicar # lo aplica en orden y lo anota en app.migraciones
   ```
Con eso entran también las compras que el plomero ya trae de ClickUp, y el cruce de tres
puntas empieza a dar resultados reales.

Si el número de WhatsApp ya está conectado al preview, lo que llegó por ahí vive en dev:
refrescar lo borra. Refrescar una vez por semana (por ejemplo, el lunes temprano) y no más.

## 2. Qué se hace en paralelo
- **Espejo de ClickUp** (`/espejo`): cada OP real de los últimos 45 días vista con las reglas
  de la app: si cruzan compra, remito y factura (se aprobaría una sola vez), por qué no las
  que no, y si el proveedor tiene el alta para pagar. Arriba, el resumen: cuántas cruzarían y
  los motivos más comunes.
- **Buzón y WhatsApp**: encargados y proveedores mandan remitos, facturas y confirmaciones al
  número. La app los lee y cruza; ClickUp sigue igual. Se compara lo que la app cruzó con lo
  que se hizo a mano.
- **Compras**: las de ClickUp (vía el plomero) y las que entran por el Buzón, con su saldo.
- Lo que la app marque mal se anota y se corrige acá antes de pasar.

## 3. Cuándo pasar
Cuando, por dos semanas seguidas:
- la gran mayoría de las OP del espejo cruzan (los motivos que quedan son excepciones reales:
  servicios sin remito, compras sin factura),
- los proveedores que se pagan tienen el alta completa,
- y lo que entra por WhatsApp se lee y cruza sin corregir a mano.

Entonces, con el OK de Adriano: aplicar los `sql/` en production (`npm run sql` contra
production), apuntar la app a production, crear los usuarios y apagar las listas Pagos y CC
de ClickUp (fase 3 del plan).

## Hoy (19/11, base dev)
45 OP de ClickUp con 207 facturas: ninguna cruza las tres puntas porque en dev todavía no hay
compras (entraron a la base después de la copia). 99 facturas son de proveedores sin CBU ni
alias, 36 no tienen remito ni quién retiró y 3 no tienen PDF.
