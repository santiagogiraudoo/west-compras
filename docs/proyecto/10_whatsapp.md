# 10 · Configurar el número de WhatsApp Business (Cloud API de Meta)

Para que lo que manden proveedores, encargados y contratistas al número entre solo al Buzón
(`09_flujo_entrada.md`). Se hace una vez. Los nombres de los menús de Meta cambian seguido:
si algo no aparece igual, buscá el mismo concepto.

## 0. Antes de empezar
- **Cuenta de Meta Business** (business.facebook.com) de la empresa, con un admin.
- **El número**: tiene que poder recibir un SMS o una llamada para verificarlo.
  - Si hoy está en la **app WhatsApp Business del celular**: al pasarlo a la API deja de
    andar en el celular, salvo que Meta te ofrezca **coexistencia** (app + API en el mismo
    número) al agregarlo. Si no la ofrece, conviene un número nuevo para esto.
  - Si es nuevo o no está en ningún WhatsApp: listo.

## 1. Crear la app en Meta
1. developers.facebook.com → **Mis apps → Crear app** → tipo **Empresa (Business)**, vinculada
   a la cuenta de Meta Business de la empresa.
2. En la app: **Agregar producto → WhatsApp → Configurar**.

## 2. Agregar el número
1. **WhatsApp → Configuración de la API (API Setup) → Agregar número de teléfono**: nombre
   visible ("West Desarrolladora"), categoría y verificación por SMS o llamada.
2. Copiá el **Identificador del número de teléfono (Phone number ID)** → `WHATSAPP_PHONE_ID`.

## 3. Token que no vence
El token de la pantalla de API Setup dura 24 horas: sirve para probar, no para dejarlo andando.
1. business.facebook.com → **Configuración del negocio → Usuarios → Usuarios del sistema →
   Agregar** (rol admin).
2. **Asignar activos**: la app y la cuenta de WhatsApp, con control total.
3. **Generar token** para la app, **sin vencimiento**, con los permisos
   `whatsapp_business_messaging` y `whatsapp_business_management` → `WHATSAPP_TOKEN`.

## 4. Las otras dos claves
- **Clave secreta de la app**: en la app de Meta, **Configuración → Básica → Clave secreta**
  → `WHATSAPP_APP_SECRET`. Con ella la app comprueba que el aviso viene de Meta.
- **Token de verificación**: inventá una cadena larga al azar → `WHATSAPP_VERIFY_TOKEN`.

## 5. Una dirección pública para la app (desarrollo)
Meta tiene que poder llamar a `/api/whatsapp` por HTTPS. En desarrollo, lo más simple es el
**deploy de la rama en Vercel** (preview):
1. Vercel → proyecto → **Settings → Environment Variables**, para **Preview**:
   `WHATSAPP_TOKEN`, `WHATSAPP_PHONE_ID`, `WHATSAPP_APP_SECRET`, `WHATSAPP_VERIFY_TOKEN`,
   `ANTHROPIC_API_KEY`, `DATABASE_URL` de la rama `dev-app-compras` (nunca production),
   `AUTH_SECRET` y `APP_URL` (la dirección del preview, para los links a los archivos).
2. Hacer el deploy de la rama y copiar su dirección (`https://….vercel.app`).
3. Si el preview tiene **protección de Vercel** (pide login), Meta no entra: en **Settings →
   Deployment Protection → Protection Bypass for Automation** generá un secreto y agregalo a
   la URL del webhook: `?x-vercel-protection-bypass=<secreto>`.

## 6. Conectar el webhook
1. Meta → app → **WhatsApp → Configuración → Webhook → Editar**:
   - **URL de devolución de llamada**: `https://<preview>.vercel.app/api/whatsapp`
     (+ `?x-vercel-protection-bypass=…` si corresponde).
   - **Token de verificación**: el mismo `WHATSAPP_VERIFY_TOKEN`.
   - **Verificar y guardar**: Meta llama a la app y esta contesta si el token coincide.
2. En **Campos del webhook**, suscribite a **messages**.

## 7. Probar
1. Desde un celular, mandá al número una foto de una factura o un remito (con un texto si
   querés: "es para West Club").
2. En la app, **Buzón**: tiene que aparecer con canal WhatsApp, qué es y qué se hizo. El
   celular recibe la respuesta ("Recibida la factura 00003-…").
3. Si no llega nada:
   - Meta → Webhook: revisá que **messages** esté suscripto.
   - Vercel → **Logs** del deploy: un 401 es firma o claves; un 403 en la verificación es el
     token de verificación.
   - Con la app de Meta en modo **Desarrollo** puede que solo lleguen avisos de los números
     de prueba: pasala a **Activa (Live)** (pide una URL de política de privacidad).

## Lo que cuesta
Contestar dentro de las 24 h de que el otro escribió no tiene costo. Mandar un mensaje
primero (por ejemplo, avisarle a quien aprueba) requiere plantillas aprobadas por Meta y un
medio de pago en la cuenta de WhatsApp: eso es para el aviso a aprobadores, más adelante.
