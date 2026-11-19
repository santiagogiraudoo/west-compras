# 05 · La IA y el plomero

Relevamiento del 18/11 del repo `santiagogiraudoo/west-plomero` y de lo que deja en la base,
para decidir qué hace la app con IA sin pisarse con el plomero. Para discutir con Adriano.

## Qué hace hoy el plomero

Corre cada hora de lunes a viernes de 8:05 a 20:05 (cron-job.org) y, en fila:

| Proceso | Qué hace |
|---|---|
| mail | Baja los adjuntos de los mails de facturas a `- Proveedores/_Entrada facturas` |
| facturas | Lee las facturas nuevas (QR de ARCA + Claude), las carga con `cc.cargar_nuevos` y `cc.cargar_items`, archiva el PDF y la suma a la CC de ClickUp |
| completar | Busca quién retiró, remito y unidad (fotos de "03 Remitos", tareas de Compras). Sigue en sombra |
| estados | Copia los estados de las OP de ClickUp |
| ops | Arma OP en ClickUp desde las CC aprobadas y las reserva con `cc.cargar_pagos` |
| pagos | Lee los comprobantes de las OP pagadas en ClickUp y registra el pago |
| adjuntos, movimientos, revision, parte, respaldo, iva_mensual | Archivos, mails a Adriano, respaldo y libro de IVA |

Cada corrida queda en `cc.ejecuciones` (proceso, modo sombra/real, resultado, detalle en
jsonb). Los documentos que no pudo cargar quedan en `cc.documentos` como `revisar` o `ilegible`.

**En la app:** la pantalla **Plomero** muestra todo eso (estado, procesos, lo que hizo, errores,
cómo viene la IA y lo que quedó para revisar). Solo lee.

## Cómo lee facturas con IA

- **Modelos:** `claude-haiku-5-5` si el PDF tiene texto, `claude-sonnet-5-5` si es foto o escaneo.
- **El QR de ARCA manda** en CUIT, tipo, letra, punto de venta, número, fecha y total. La IA
  completa el resto (neto, IVA, percepciones, ítems, lo escrito a mano) y anota sus dudas.
- **Controles:** total de la IA contra el del QR (±$1), neto + IVA + percepciones = total,
  duplicados por hash del archivo y por proveedor + PV + número. Con dudas igual carga, marcada
  "⚠️ revisar".
- **Últimos 30 días (copia de prod del 17/11):** leyó 78 documentos y cargó 32 facturas. El 72 %
  vino **sin QR** (solo IA, sin el control del QR) y el 90 % trajo alguna alerta. Hay 10 documentos
  para revisar a mano y 1 ilegible.

## Qué hace la app con IA (propuesta)

1. **Comprobantes de pago — ya está.** Al registrar un pago se sube el comprobante y Claude lo
   lee y lo coteja con el neto y la cuenta del proveedor (`src/lib/pagos/leer-comprobante.ts`).
   No choca con el plomero: si la OP ya está Pagada, `pagos.py` saltea la carga.
   Falta `ANTHROPIC_API_KEY` en Vercel. Usa `claude-opus-5-5`; se podría bajar a Sonnet como el
   plomero si el costo importa.
2. **Facturas y remitos desde la app — no armar otro lector.** Lo más seguro es que la app suba la
   foto o el PDF a `_Entrada facturas` (o "03 Remitos") de SharePoint y deje que el plomero haga
   todo: hash, QR, IA, archivo y CC de ClickUp. Necesita la conexión a SharePoint (pendiente).
   Cargar directo con `cc.cargar_nuevos` duplicaría reglas que ya resolvió el plomero (hash en
   `cc.documentos`, formato del número, listas cerradas de rubro, titular y aprobador, la CC de
   ClickUp, los casos de Yrigoyen y de facturas partidas).
3. **Revisar lo que la IA dudó.** Las facturas cargadas con "⚠️ revisar" y los documentos en
   `revisar` o `ilegible` son el trabajo manual que queda. La Bandeja y la pantalla Plomero ya los
   muestran; el paso siguiente es poder resolverlos desde la app.

## Para decidir con Adriano

- ¿La app sube archivos a SharePoint para que los procese el plomero? (Recomendado.)
- El 72 % sin QR: ¿se puede pedir a los proveedores la factura electrónica con QR, o mejorar la
  lectura del QR en fotos?
- ¿Qué modelo usar para los comprobantes de pago (Opus o Sonnet)?
- `completar` sigue en sombra: ¿cuándo pasa a real?

## Contrato de lectura (19/11)

La app (`src/lib/facturas/leer-factura.ts` + `lectura.ts`) y el plomero
(`plomero/documentos.py`, rama `robustez-lectura-ia`) leen facturas con la API de Claude.
Para que lo que entra a `cc` sea igual venga de donde venga, las dos siguen estas reglas:

| Qué | Regla |
|---|---|
| Formato de la respuesta | Structured outputs (`output_config.format`): la respuesta siempre cumple el esquema. Se mira `stop_reason`: `refusal` o `max_tokens` es "no se pudo leer", nunca datos a medias. |
| Lo que no se ve | `null` y una línea en `dudas`. Ningún campo fiscal es obligatorio en el esquema: obligarlo hace que la IA lo invente. |
| Número | Siempre `PPPPP-NNNNNNNN` (5 + 8, como ARCA). Se compara con `claveComprobante` / `cc._clave_comprobante`. |
| Montos | Con punto decimal. Se leen con `leerMonto` (app) o `num_ar` (plomero), nunca con `float`/`new Decimal` sobre el texto crudo. |
| CUIT | Se valida el dígito verificador. Si no da, es una mala lectura: se avisa, no se da de alta un proveedor nuevo. |
| Fechas | `AAAA-MM-DD`. Fecha futura o de hace más de dos años: aviso. Vencimiento anterior a la fecha: se descarta (la base lo rechaza) y se usa el plazo del proveedor. |
| Moneda | Se pide a la IA y se toma del QR. Si no es pesos: aviso, los importes no se cargan como pesos sin revisar. |
| Notas de crédito | El signo lo lleva el comprobante (negativo); los ítems van en positivo. |

Sin QR (72 % de los últimos 30 días) los datos fiscales salen solo de la IA: por eso estos
controles. El plomero ahora busca el QR también en las imágenes embebidas del PDF.
