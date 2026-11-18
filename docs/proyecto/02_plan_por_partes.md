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

## Fase 3 en detalle (18/11)

1. **Aprobación por línea** (`/op`): en las OP armadas en la app, cada factura se aprueba u observa (rol admin: "todos los pagos pasan por Adriano"). Observar pide motivo y frena toda la OP. Cada decisión queda en `app.aprobaciones_op` (vale la última; `sql/007`). Las OP de ClickUp se siguen aprobando allá.
2. **Pagos** (`/pagos`, Candela): OP autorizadas, la que vence primero arriba, con la cuenta del proveedor. "Registrar pago" carga fecha, medio, referencia, link del comprobante y retenciones; el neto se calcula. Pasa a Pagada con `cc.cargar_pagos` y aparece en el extracto.
3. **La base frena**: una OP de la app no pasa a Pagada con líneas sin aprobar (trigger de `sql/007`), y `cargar_pagos` rechaza si total − retenciones ≠ neto.

Falta para cerrar la fase 3 (espera respuestas):
- **Retenciones calculadas**: hoy se cargan a mano. Falta el doc de retenciones de Candela (Ganancias depende de lo pagado en el mes al proveedor; IIBB de su alícuota).
- **Aprobadores por unidad y topes**: hoy aprueba el admin. Falta quién aprueba qué unidad y hasta cuánto (Santiago). Con topes, la línea que cruza compra, remito y factura dentro del tope se aprueba sola ("se aprueba una sola vez").
- **Aviso por WhatsApp**: falta el número/API (Santiago).
- **Comprobante**: se pega el link de SharePoint; subirlo desde la app espera el permiso de escritura en SharePoint.

Para usar fases 2 y 3 de verdad hay que aplicar `sql/002` a `sql/007` en production (con OK de Adriano) y crear los usuarios (Candela como operador).
