# App de compras y pagos · plan por partes (17/11/2026)

Decisiones de Adriano: repo aparte que después se une a la app de alquileres como otra sección después del login; por partes y en paralelo con ClickUp; todo pensado para la compu.

## Cómo está armado el repo para que unirlo sea fácil

- Mismo stack, design system y reglas que la app de alquileres (ver `CLAUDE.md`).
- **Datos en las primeras fases: la base de proveedores de hoy** (Neon west-cc, esquema `cc`). El plomero sigue igual, no hay migración de datos y la app escribe con las mismas funciones que ya frenan duplicados y totales que no cierran (`cc.cargar_nuevos`, `cc.cargar_items`). Lo propio de la app va en el esquema `app`.
- Rol propio en Neon (`app_compras`): lee todo, escribe con las funciones, no borra.
- Desarrollo sobre la rama `dev-app-compras`, nunca sobre production.
- **Al unir**: las pantallas pasan como una sección más del menú de la app de alquileres; los datos se migran según `01_mapa_datos.md` (si Santiago elige una sola base).

## Fases

| Fase | Qué entra | Quién la usa | Listo cuando |
|---|---|---|---|
| 0. Definir | Respuestas de Santiago, tabla de topes, doc de retenciones de Candela | — | Las preguntas abiertas están contestadas |
| 1. Bandeja de facturas | Login, inicio (lo que hay que hacer + tablero), bandeja con solo las que fallan, ficha de factura con PDF al lado, alta de proveedor obligatoria | Adriano | Adriano procesa una semana de facturas solo en la app |
| 2. Cuenta corriente y OP | Cuenta corriente por proveedor (extracto, saldo a favor, PDF a pedido), armado de OP eligiendo facturas, OP con líneas de varias unidades | Adriano | Las OP nuevas nacen en la app |
| 3. Aprobación y pago | Tarjeta de aprobación por línea, aviso por WhatsApp (solo aviso), pantalla de Candela por vencimiento con retenciones calculadas, comprobante, registro automático | Aprobadores y Candela | Una semana de pagos sin ClickUp; se apagan las listas Pagos y CC |
| 4. Compras y remitos | Orden de compra con link a ClickUp, cotizaciones, bot de WhatsApp para remitos (encargados, contratistas y proveedores), cruce compra ↔ remito ↔ factura, topes | Todos | Una factura que cruza con su compra y su remito pasa sin que nadie la toque |
| 5. Unir con alquileres | Sección dentro de la app, migración, gasto por propiedad y salida de caja automáticos, resultado por propiedad y unidad | Todos | Una sola app, una sola base |
| Después | Contratistas, chequera, IVA, flujo de caja | — | — |

## Fase 1 en detalle

1. **Inicio** (hecho): lo que hay que hacer, leído de `cc.v_alertas` y `cc.v_calidad`, y abajo el tablero de deuda (solo West Desarrolladora).
2. **Bandeja**: facturas que no pasaron solas, con el motivo. Tocar abre la ficha.
3. **Ficha de factura**: PDF a la izquierda (necesita permiso de lectura de SharePoint), datos a la derecha con lo que falta marcado, renglones, botón aprobar que no se habilita hasta que esté todo.
4. **Proveedor**: alta con los 5 datos obligatorios y su ficha.

No entra en la fase 1: OP, aprobaciones, WhatsApp, compras, topes.

## Fase 2 en detalle (17/11)

1. **Cuenta corriente** (`/cuenta/[proveedor]`): facturas abiertas con vencimiento y extracto debe/haber; saldo, saldo a favor y PDF a pedido.
2. **Armado de OP** (`/op/nueva`): facturas aprobadas libres de un proveedor, un solo titular, reservada Prevista con `cc.proxima_op` + `cc.cargar_pagos`. Necesita `sql/002_reservas_op.sql` aplicado.
3. **OP abiertas** (`/op`): previstas con sus facturas.

Criterio de deuda: lo que falta pagar = saldo de `cc.v_saldo_comprobante` + lo imputado en OP previstas.

## Fase 3 en detalle (18/11, primera versión para mirar y ajustar)

Ciclo de la OP armada en la app: **En armado → A aprobar → Autorizada → Pagada**, más **Observada**, **Bloqueada** y **Descartada**. El estado no se guarda: lo deriva la base en `app.v_op_estado` (`sql/009`).

1. **Armar** (`/op/nueva`): facturas aprobadas libres de un proveedor; queda En armado. En `/op`: Mandar a aprobar o Descartar (con motivo; las facturas vuelven a quedar libres).
2. **Aprobadores** (`/configuracion`, `app.aprobadores`): unidad → usuario. Por defecto Adriano; West Club (UN-02) para Santiago Giraudo mientras dure la obra (hay que crearle el usuario y elegirlo ahí). Columnas de tope (USD blue) vacías y sin usar.
3. **Para aprobar** (`/aprobar`): una tarjeta por OP con proveedor, total, unidad y vencimiento; chequeos en verde/amarillo (cruza con remito, tiene PDF, alta del proveedor, precio contra la última compra con margen de 5 %); tabla Factura · Fecha → Vto. · Quién · Para qué · Unidad · Monto con link al PDF; Aprobar / Observar / Bloquear (con comentario) sobre los renglones de las unidades de quien aprueba, y los de otros en gris con su estado. Un renglón observado o bloqueado frena toda la OP. Cada decisión queda en `app.aprobaciones_op` con quién, cuándo y el comentario. Ver más: ítems con el precio anterior, deuda con el proveedor, últimas compras.
4. **Para pagar** (`/pagos`, Candela): autorizadas por vencimiento, con CBU, alias, titular y CUIT para copiar; retenciones a mano, neto calculado y comprobante (archivo o link). Queda Pagada con `cc.cargar_pagos` y sus imputaciones.
5. **La base frena**: no se paga una OP de la app que no esté Autorizada (trigger), y `cargar_pagos` rechaza si total − retenciones ≠ neto. El pago bloquea la OP mientras se registra: dos personas pagando a la vez no la pisan.
6. **Resolver**: lo observado o bloqueado le llega a Adriano, que lo resuelve con un botón aparte y comentario. Aprobar lo propio nunca pisa la observación de otro.
7. **Inicio**: OP en armado, esperando a alguien ("esperando a X hace N días"), observadas o bloqueadas, y autorizadas para pagar.
8. **Sin doble pago con ClickUp**: una factura que una OP prevista de ClickUp lleva en `cc.op_cc` no se puede poner en otra OP (en production eran 33 facturas, $16,2 millones).

Falta (espera respuestas):
- **Topes**: con topes, el renglón que cruza compra, remito y factura dentro del tope se aprueba solo ("se aprueba una sola vez"). Los define Santiago.
- **Retenciones calculadas**: falta el doc de Candela.
- **Aviso por WhatsApp** a quien aprueba: falta número/API.
- **Comprobante en SharePoint**: mientras no haya permiso de escritura, el archivo queda en `app.comprobantes_pago`.
- **Factura con ítems de varias unidades**, partida por ítem: caso raro, no entra en esta versión.

**Antes de unir esta rama a main:** aplicar `sql/009` y `sql/010` en production, porque Vercel production ya lee la base real.
