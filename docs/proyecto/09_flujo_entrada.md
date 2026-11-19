# 09 · Flujo de entrada de documentos (19/11)

Cómo entra a la app todo papel de una compra (factura, nota de crédito, remito, comprobante
de pago) y qué pasa con él hasta la Bandeja. Decisión del 19/11: **un buzón único y un solo
procesador, en la app**. Hoy lo operativo sigue en ClickUp y el plomero; esto es el destino
que se construye y se prueba en desarrollo.

## El flujo

```
 Canales                Buzón (app.entrada)         Procesador (src/lib/entrada)           Resultado
 ─────────              ──────────────────          ─────────────────────────────          ─────────
 App: subir      ─┐                                 1. Leer: una llamada a Claude que
 WhatsApp        ─┼──►  un archivo = una fila  ──►     dice qué es y lo extrae          ──► Factura Pendiente
 Mail            ─┘     (hash: el mismo archivo     2. Controlar (contrato de lectura)      (cc.cargar_nuevos)
                         por dos canales entra      3. Proveedor: por CUIT; por WhatsApp ──► Remito
                         una sola vez)                 también por el teléfono               (cc.cargar_remitos)
                                                    4. Decidir qué hacer                 ──► Remito ↔ factura
                                                    5. Cruzar remitos con facturas          cruzados
                                                                                         ──► A revisar, con motivo
                                                                                         ──► Descartado, con motivo
```

### 1. Canales
- **App**: "Añadir documento" (hoy "Añadir factura"). Quien sube queda como remitente.
- **WhatsApp Business**: un número al que proveedores, encargados y contratistas mandan foto o
  PDF. El remitente se reconoce por su teléfono normalizado (`549` + área + número, el mismo
  formato del alta de proveedor). El texto que acompaña ("es para West Club", "retiró Juan")
  queda guardado como pista. Se contesta con un acuse: qué se entendió o qué falta.
- **Mail**: las casillas de facturas. Mientras el plomero opere, él baja los adjuntos.

### 2. Buzón (`app.entrada`, sql/021)
Una fila por archivo: canal, remitente, archivo, `sha256` único, estado (`recibido → leido →
procesado | revisar | duplicado | descartado`), qué es (`factura`, `nota_credito`,
`nota_debito`, `remito`, `comprobante_pago`, `otro`), la lectura y lo que se hizo. Nada se
pierde: lo que no se pudo procesar queda con su motivo y se resuelve a mano.

### 3. Procesador
1. **Leer**: una sola llamada a Claude que clasifica y extrae (contrato de lectura,
   `07_ia_y_plomero.md`): structured outputs, `null` en vez de inventar, montos con
   `leerMonto`, número `PPPPP-NNNNNNNN`.
2. **Controlar**: CUIT con dígito verificador, fechas, moneda, total que cierra.
3. **Proveedor**: por CUIT del emisor. Si llega por WhatsApp de un proveedor conocido, su
   teléfono lo confirma. Sin proveedor → revisar ("dalo de alta").
4. **Decidir** (`decidirEntrada`, puro y con tests):

| Qué es | Qué se hace |
|---|---|
| Factura / NC / ND | Si ya está (misma clave) → duplicado. Si no, se carga **Pendiente** con `cc.cargar_nuevos` + ítems; lo dudoso va "⚠️ revisar". Titular por CUIT del receptor; unidad si el texto o el remito la dicen. |
| Compra | Se crea con `cc.cargar_compras` (clave `app:…`) y se lleva los remitos que ya habían llegado. |
| Remito | Se carga con `cc.cargar_remitos` (firmado = `ok`, sin firma = `falta`), se ata a su compra (o la crea) y a su factura. |
| Comprobante de pago | No se registra solo: queda para "Registrar pago" de la OP que coincida. |
| Otro | Descartado con motivo (presupuesto, foto de stock, planilla). |

5. **Cruzar las tres puntas: compra ↔ remito ↔ factura** (`cruce.ts`, reglas del plomero
   `completar.py`). La cadena queda en la base: `cc.remitos.compra_id` y `comprobante_id`;
   `app.v_compras` dice lo comprado, lo facturado y el saldo de cada compra.
   - **Compra**: entra con su confirmación (pedido, orden o presupuesto aceptado) o, si no
     hay, con el remito: "la compra entra con el remito o la confirmación" (Adriano 17/11).
     La orden sigue en ClickUp hasta que la app la reemplace.
   - **Remito → compra**: una compra abierta del proveedor que el remito cite, o la única con
     el mismo importe y de hasta 60 días antes. Si no hay una sola, el remito crea su compra.
     La compra que llega después se lleva los remitos sueltos que la citan, el que tiene su
     importe o los que lo suman (entregas parciales).
   - **Remito ↔ factura**: el remito cita la factura · la factura cita el remito · mismo
     importe (menos de $1) y fecha cercana · **factura de remitos**: la factura es la suma
     exacta de varios remitos abiertos. El remito que llega antes que su factura se liga
     cuando entra la factura.
   - **Control de tres puntas** (`tresPuntas`): lo facturado contra lo comprado (tolerancia
     cero) y remitos firmados. Es lo que permite aprobar una sola vez: compra dentro del tope
     + factura que cruza con compra y remito → no pide otra firma.
   - La unidad sale del destino escrito ("obra West Club") solo si nombra una sola.

### 4. Después
La factura sigue el camino de siempre: **Bandeja** (lo que no pasó solo, con el motivo) →
**aprobación** (una sola vez; con remito cruzado y dentro del tope sale sola) → **OP** →
**pago**. Una NC queda atada a la factura que cancela (pendiente, `08_analisis_robustez.md` §5).

## Qué hace cada uno
- **App**: canales, buzón, procesador, cruce, Bandeja, OP y pago.
- **Base**: frena lo que no puede pasar (repetidos por clave, vencimiento, imputaciones).
- **Plomero**: mientras la app esté en desarrollo, sigue operando igual. Cuando la app
  procese la entrada en producción, el plomero deja de leer facturas.

## Canal WhatsApp
Cómo configurarlo, paso a paso: `10_whatsapp.md`. El webhook es `/api/whatsapp`.

## En la app
- **Buzón** (`/entrada`): lo que llegó por cada canal y qué se hizo; volver a procesar.
- **Compras** (`/compras`): cada compra con lo comprado, lo facturado, el saldo y si cruzan
  las tres puntas.
- **Ficha de la factura**: tarjeta "Compra" con la cadena entera (remitos, a qué factura fue
  cada uno, saldo y si cruza).
- **Añadir factura**: usa el mismo lector y guarda el archivo en el buzón; ata los remitos
  que ya estaban.
- **Aprobación**: un renglón sale aprobado solo por tope únicamente si cruzan compra, remito
  y factura (chequeo "Cruza con la compra" en la tarjeta).

## El conciliador: en la base, por consecuencia
La cadena compra ↔ remito ↔ factura la arma la **base**, en el momento en que algo cambia: entra
o se corrige un remito, una factura o una compra, la escriba la app, WhatsApp o el plomero
(`sql/023_conciliar_por_consecuencia.sql`). No hay tareas programadas ni nada que atar a mano,
y las reglas están una sola vez:
1. cada factura sin remito se lleva los remitos sueltos que la citan, que ella cita, el único con
   su importe y fecha, o los que suman su total exacto (estos dos últimos, solo si ninguna otra
   factura abierta tiene el mismo total: no adivina);
2. cada remito sin compra (desde `app.conciliar_compras_desde`, por defecto 2026-11-01) va a la
   compra abierta que cita o a la única con su importe; si no hay, crea su compra provisoria;
3. si después llega la compra de verdad, el remito pasa a ella y la provisoria se descarta.
Lo que ya estaba abierto se concilió una vez al aplicar el 023. Pruebas: `sql/pruebas/023_conciliar.sql`
(9 casos, se deshace sola).

En dev (19/11): 35 compras desde los remitos de noviembre, 10 con las tres puntas cruzadas.
No ató ningún remito suelto a factura: los 20 que hay no tienen importe ni citan la factura, y
donde hay facturas cerca son varias.

## Falta para que todo cruce
- **Importe en los remitos**: casi ningún remito que carga el plomero lo trae (sin importe no
  hay cruce de tolerancia cero). El Buzón lo lee; el plomero debería leerlo igual.
- **`cc.remitos.origen` con notas**: además de plomero/excel/yrigoyen tiene textos como
  "plomero (10/11: duplicado del id 182…)". El origen tiene que ser una lista fija y la nota ir
  aparte (cambio del plomero y de production).
