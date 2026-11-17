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
