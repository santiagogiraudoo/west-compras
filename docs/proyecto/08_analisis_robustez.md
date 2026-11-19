# Análisis de robustez: lógica, flujos y datos (19/11/2026)

Pedido: revisar toda la lógica, los flujos y la forma de los datos para evitar problemas
a futuro, con tests que lo cubran, y empezar a corregir.

Rama: `adriano/robustez-datos` (sale de `ui/primer-tema` en 0fb1c3a). Base revisada:
Neon west-cc, rama `dev-app-compras` (copia de production del 17/11 + lo cargado en dev).

## 1. Lo que dicen los datos (base dev)

Consultas de solo lectura sobre `cc` y `app`. Lo que ya está bien no se lista salvo para
dejar constancia de que se miró.

### Bien
- CUIT de proveedores: todos con formato `99-99999999-9`, dígito verificador correcto, sin
  repetidos (lo frena `proveedores_cuit_formato` y `proveedores_cuit_key`).
- Signo de comprobantes: notas de crédito ≤ 0, el resto ≥ 0 (`comprobantes_signo_check`).
- Titulares, unidades y rubros de los comprobantes: todos existen en su tabla (FK + los
  triggers `_normalizar_*` que llevan el texto al nombre canónico).
- Retenciones: `total_retenciones` = suma de las cinco en todas las OP.
- Imputado por factura nunca supera su total.

### Mal o frágil

| # | Qué | Cuántos | Riesgo |
|---|---|---|---|
| D1 | **Número de comprobante en formatos distintos**: `0003-00045093` (histórico, 293) y `00003-00045093` (plomero, 165). `comprobante_unico` y `cargar_nuevos` comparan el texto tal cual: la misma factura con el punto de venta en 4 o en 5 dígitos entra dos veces. | todas | **Doble carga → doble pago** |
| D2 | **Sufijos de factura partida por unidad** en tres convenciones: `-A` (histórico), `/A` (claude), ` · FEEDLOT` (histórico). Hoy el reparto por unidad lo hacen los ítems (`v_op_renglones`), así que partir el número ya no hace falta, pero la detección de repetidas tiene que entender las tres. | 7 grupos | Repetidas no detectadas o falsas |
| D3 | **OP que imputa un comprobante de otro proveedor**: OP-2026-122 (proveedor PR-016) paga el ticket TK-20261021-30000 de PR-054. Nada en la base lo frena. | 1 | Pago al proveedor equivocado |
| D4 | **OP con titular distinto al de la factura**: OP-2026-028 (Yrigoyen) imputa 0013-00076990 facturada a Giraudo. Es anterior al trigger `titular_imputacion`, que hoy sí lo frena. | 1 | Histórico, solo vigilar |
| D5 | **Vencimiento anterior a la fecha**: 00000-00474201, fecha 22/10/2026, vence 22/10/2024 (la IA leyó mal el año). Nada lo frena. | 1 | Caja y vencidos mal calculados |
| D6 | **Ítems de notas de crédito con dos signos**: el histórico (15) los guarda en positivo y Claude/Cowork (3) en negativo. Para el reparto por unidad da igual mientras todos los ítems de una NC tengan el mismo signo, pero suma por ítem entre facturas no. Regla elegida: **el ítem va en el signo del documento** (positivo; negativo solo un descuento dentro de la factura), como el histórico; la app ya cargaba así. | 3 | Sumas por ítem inconsistentes |
| D7 | **Ítems que no suman ni el neto ni el total** (> $1). | 27 | Reparto por unidad sesgado |
| D8 | **Teléfonos/WhatsApp** en 9 formatos (`999-9999999`, `9999 999999 / 9999 999999`, etc.). El alta exige WhatsApp, pero no hay forma única. | casi todos | El aviso por WhatsApp no va a poder usarlos |
| D9 | **Imputaciones en cero** en OP anuladas (y una en OP-2026-158 prevista): anular deja el renglón con importe 0 en vez de borrarlo. Todo lo que sume imputaciones tiene que tratarlas igual. | 8 | Conteos de "facturas en la OP" distintos según la pantalla |
| D10 | **OP previstas de ClickUp sin imputaciones** pero con `total_imputado` > 0, y OP-2026-003 pagada sin imputaciones (histórico). | 20 | La deuda por OP no se puede reconstruir desde imputaciones |
| D11 | **Tipos de comprobante con y sin letra**: `Factura`, `Factura X`, `Ticket`, `Remito`, `Sin factura` conviven con `Factura A/B/C`. | — | Reglas por letra (IVA, NC) que no ven las sin letra |
| D12 | Comprobantes sin unidad: 7 (uno Aprobado y uno Pendiente). | 7 | No tienen quién los apruebe |

## 2. Lo que dice el código

Dos revisiones en paralelo, una de **datos y formatos** y otra de **flujos, estados y
concurrencia**, cada hallazgo verificado leyendo el código.

### Datos y formatos

| # | Qué | Sev. | Estado |
|---|---|---|---|
| C1 | El mismo monto escrito valía distinto según la pantalla: tope "1.500" → US$ 1,50 (`new Decimal`), "1.000.000" daba error. | Alta | **Hecho**: `leerMonto` único (`src/lib/montos.ts`) en topes, retenciones, pago parcial, extraordinaria, factura nueva e ítems. |
| C2 | `leerImporte("1,234.56")` daba $1,23 y pasaba como pago parcial. | Alta | **Hecho**: lo ambiguo se rechaza. |
| C3 | La tolerancia "cero, menos de $1" escrita de 4 maneras (`gt(1)`, `lt(1)`, `0.005`, `0.5`). | Media | **Hecho** en lib y acciones: `cierra()` y `MARGEN_LIBRE`. Quedan ~15 `Number(x) > 0.5` en páginas (solo muestran): pasarlas a `hayLibre()` en la rama de UI. |
| C4 | Número de comprobante guardado con 4 o 5 dígitos de punto de venta. | Media | **Hecho**: se guarda siempre `00003-00008897`; la base frena el repetido (D1). |
| C5 | Si la IA traía el punto de venta dentro del número, se perdía (`00000-…`). | Media | **Hecho**. |
| C6 | Repetida sin mirar el tipo (AFIP numera por tipo: una NC puede tener el mismo número que una factura). | Media | **Pendiente, decisión**: `comprobante_unico` de la base tampoco mira el tipo. Si hace falta, cambia la clave en la base y en `claveComprobante`. |
| C7 | La lista de tipos del formulario no era la del server; sin letra se ponía "A" callado. | Media | **Hecho** en lógica (`TIPOS_COMPROBANTE`, aviso de letra). El formulario (`AnadirFactura.tsx`) tiene que importar la constante: es de la rama `ui/primer-tema`. |
| C8 | CUIT repetido comparado con guiones. | — | **No es problema**: la base exige `99-99999999-9` (`proveedores_cuit_formato`). |
| C9 | Cotejo de la cuenta de destino: coincidencias falsas. | Media | **Hecho**. |
| C10 | Ítems de la factura nueva sin normalizar; el resultado de `cargar_items` no se miraba. | Media | **Hecho**. |
| C11 | Listas repetidas (`MEDIOS_PAGO` ×3, `noPideRemito` = `sinRemitoAparte`). | Baja | Pendiente. |
| C12 | ~20 formateadores de pesos a mano; `formatCurrency` en ARS muestra 0 decimales contra la regla $1.234.567,89. | Baja | Pendiente (UI). |
| C13 | Dinero en `Number` en pantallas (filtros y restas). | Baja | Pendiente (UI): solo muestra, la plata se calcula en el server. |
| C14 | Dos "hoy": `hoyArgentina` y `utcToday` (marca mañana de 21 a 24). | Baja | Pendiente. |
| C15 | WhatsApp en varios formatos. | Baja | **Hecho**: `549` + área + número. |

### Flujos, estados y concurrencia

| # | Qué | Sev. | Estado |
|---|---|---|---|
| F1 | Dos sacando facturas de la misma OP a la vez: `total_imputado` ≠ suma, y el pago salía por ese total (de más). | **Alta** | **Hecho** en TS (se calcula con la OP bloqueada) **y en la base** (no se paga una OP de la app cuyo total no es la suma). |
| F2 | Aprobar podía pisar una observación hecha en el mismo momento; `v_aprobacion_linea` ordenaba por `now()`. | Media | **Hecho**: se revisa la decisión con la OP bloqueada y la vista ordena por `id`. |
| F3 | Dos OP de la misma unidad mandadas a la vez pasaban juntas el tope. | Media | **Hecho**: bloqueo por unidad. (Hoy no hay topes cargados.) |
| F4 | `cargar_pagos` chequea "imputado de más" sin bloquear la factura y contando anuladas. | Media | **Hecho para la app** (trigger con `for update`, sin anuladas). El plomero sigue con su chequeo. |
| F5 | Alta de proveedor a medias: alias sin CBU alcanza; titular de la cuenta sin verificar. | Media | **Pendiente, decisión de Adriano**: CLAUDE.md dice "CBU con titular verificado". Exigir CBU puede frenar pagos a proveedores que hoy pagan por alias. |
| F6 | Cualquier usuario no consulta arma, aprueba y paga; quien aprobó puede pagar. | Media | **Pendiente, decisión de negocio**: "todos los pagos pasan por Adriano". |
| F7 | La base no congelaba una OP pagada. | Media | **Hecho**: una OP de la app pagada no vuelve atrás. |
| F8 | Prorrateo con ítems sin subtotal; la aprobación no guarda el importe aprobado. | Baja | Pendiente. |
| F9 | Retención "NaN" dejaba el neto en NaN. | Baja | **Hecho**. |
| F10 | Pago parcial de $0,40 decía "ya en otra OP". | Baja | **Hecho**. |
| F11 | `sql/` del repo no refleja la base: 000 y 008 están en `adriano/sql-production`, 015–018 en `adriano/fase-3`, y esta rama sale de `ui/primer-tema`, que tiene lógica sin unir. | Media | **Pendiente**: unir las tres ramas antes de seguir sumando SQL. |

## 3. Lo que se hizo (rama `adriano/robustez-datos`)

- `sql/020_frenos_de_datos.sql` (aplicado en **dev**, probado con transacciones que se
  deshacen; **falta production**): clave única de comprobante, vencimiento ≥ fecha,
  imputaciones de la app (proveedor, signo, de más, con bloqueo), pago con total = suma,
  OP pagada congelada, `v_aprobacion_linea` por `id`, dos controles nuevos.
- `src/lib/montos.ts`: `leerMonto`, `cierra`, `MARGEN_LIBRE`, `hayLibre`.
- `src/lib/facturas/lectura.ts`: `claveComprobante` (misma regla que la base, con la tabla
  de formatos reales como test), `normalizarNumero`, `normalizarItems`, `TIPOS_COMPROBANTE`.
- `src/lib/errores-base.ts`: los frenos de la base en castellano.
- OP: sacar/decidir/quitar/mandar a aprobar sin carreras.
- Tests: de 128 a 195.

## 4. Antes de llevarlo a production

1. Unir `adriano/fase-3`, `adriano/sql-production`, `ui/primer-tema` y esta rama.
2. En production, correr la consulta del comentario de `sql/020` (repetidos por clave)
   y anular lo que aparezca; recién ahí aplicar 019 y 020.
3. Decidir F5, F6 y C6 (Adriano).
4. Pasar a la rama de UI: C3 en páginas, C7 en el formulario, C12–C13.
