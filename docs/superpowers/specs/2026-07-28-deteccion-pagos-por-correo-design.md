# Detección de pagos por correo — diseño

**Fecha:** 2026-07-28
**Estado:** aprobado, pendiente de plan de implementación

## Problema

La detección automática de pagos vive en `NotificationListenerService` (Kotlin) y **solo existe
en Android**: iOS no permite que una app lea las notificaciones de otras apps. Desde que
DarkMoney corre en el iPhone del usuario, ahí se perdió la función más valiosa del producto y
todo el registro es manual.

El usuario confirmó que **casi todas** sus operaciones (banco y Yape) generan un correo de
constancia, así que el correo es una fuente equivalente a la notificación.

## Objetivo

Capturar movimientos desde los correos de constancia y dejarlos como **sugerencias pendientes
de confirmación**, con la misma bandeja y el mismo flujo que ya usa la detección de Android.

### No objetivos

- No se leerá la bandeja del usuario (sin OAuth, sin `gmail.readonly`).
- No hay registro automático: nada entra a los saldos sin confirmación.
- No hay push en iOS (el Apple ID gratis no tiene APNs). El aviso es al abrir la app.
- No se reemplaza la detección de Android; conviven.

## Decisiones tomadas (y por qué)

| Decisión | Alternativa descartada | Razón |
|---|---|---|
| Reenvío con filtro de Gmail | API de Gmail con OAuth | `gmail.readonly` es scope restringido: sin verificar la app el token **caduca cada 7 días**, y verificarla exige auditoría de seguridad. Además daría acceso a TODO el correo. |
| Servicio de correo entrante + webhook | Mover DNS a Cloudflare + Email Worker | El dominio `darkmoney.company` está en **Vercel DNS** sin MX. Agregar registros MX es de bajo riesgo; migrar el DNS completo pone en riesgo el sitio y los universal links. |
| Sugerencia + confirmación | Registro automático | Un parseo equivocado ensuciaría saldos sin que el usuario se entere. |
| Parser en TypeScript | Reutilizar el de Kotlin | El de Kotlin es nativo y no corre en el servidor. Se copian sus **reglas** (ya probadas en producción), no su código. |

## Arquitectura

```
Gmail del usuario
 └─ filtro: de BCP/Yape  →  reenvía a  recibos+<token>@darkmoney.company
      └─ MX (Vercel DNS) → proveedor de correo entrante
           └─ POST firmado → edge function `inbound-email-detection`
                ├─ 1. valida la firma del proveedor
                ├─ 2. resuelve user/workspace por el <token> del alias
                ├─ 3. valida que el remitente ORIGINAL sea un banco conocido
                ├─ 4. parser puro → { movementType, amount, currency, description, occurredAt, appKey }
                ├─ 5. dedupe
                └─ 6. INSERT en notification_detected_movement_suggestions (status 'pending')
                     └─ la app (iOS y Android) la muestra al abrir → confirmar o descartar
```

## Componentes

### 1. Tabla `inbound_email_aliases` (migración nueva)

| Campo | Tipo | Nulo | Descripción |
|---|---|---|---|
| token | text | no | Parte variable del alias. Aleatorio ≥24 chars. PK. |
| user_id | uuid | no | Dueño del alias. |
| workspace_id | bigint | no | Workspace donde se crean las sugerencias. |
| created_at | timestamptz | no | |
| revoked_at | timestamptz | sí | Si se filtra el alias se revoca y se genera otro, sin tocar la cuenta de correo. |

RLS: el usuario solo ve/rota los suyos. La edge function lo lee con service role.

### 2. Edge function `inbound-email-detection`

Sigue el patrón de `assistant-chat`: `index.ts` (I/O, Deno) + `logic.ts` (puro, testeable con jest).

Responsabilidades de `index.ts`:
1. Verificar la firma del webhook del proveedor. Sin firma válida → 401.
2. Extraer `to` (para el token), `from` original, `subject`, cuerpo de texto y `Message-ID`.
3. Buscar el alias; si no existe o está revocado → 404 y no se procesa.
4. Llamar al parser. Si no reconoce el correo → 200 con `{ ignored: true }` (no es error:
   el usuario puede reenviar cualquier cosa por accidente).
5. Aplicar dedupe e insertar.

### 3. Parser (`logic.ts`, puro)

Firma: `parseReceiptEmail({ from, subject, text }) → ParsedReceipt | null`

```ts
type ParsedReceipt = {
  movementType: "income" | "expense" | "transfer";
  amount: number;
  currencyCode: string;      // "PEN" | "USD"
  description: string;
  occurredAt: string;        // ISO; si el correo no la trae, la fecha de recepción
  financialAppKey: string;   // "bcp_email" | "yape_email"
  confidence: "high" | "medium";
};
```

Empieza con **BCP y Yape**. Cada banco es una función con sus patrones + su test con correos
reales anonimizados. Agregar otro banco = una función y un test, sin tocar el resto.

Reglas que se copian del Kotlin ya probado:
- Extracción de monto tolerante a formato (`S/ 1,234.56`, `PEN 30.00`).
- Verbos que definen el tipo: "pagaste"/"enviaste"/"yapeaste" → gasto; "recibiste"/"te envió" → ingreso.
- Para transferencias no se intenta adivinar comercio; la descripción es "Transferencia <banco>".
- Al buscar el comercio, limitar la ventana de texto: el disclaimer de BCP ("en sorteos o
  promociones") contamina el extractor si se lee el correo completo.

### 4. Deduplicación (dos capas)

**Capa 1 — reintentos del webhook.** `dedupe_key = "email:" + Message-ID`. La tabla **ya tiene**
el índice único `uq_detected_movement_suggestion_dedupe (user_id, workspace_id, dedupe_key)`,
así que un reintento choca contra el índice y se responde 200 sin duplicar. **No requiere
migración.**

**Capa 2 — contra la detección de Android.** El usuario usa ambos teléfonos con la misma cuenta:
un yape genera push (Android) *y* correo. Antes de insertar se descarta si existe:
- una sugerencia del mismo `amount` en los últimos 10 min, o
- un movimiento registrado del mismo `amount` en las últimas 2 h (misma ventana que usa hoy
  `hasManualRegisteredAmount` en Kotlin).

### 5. Proveedor de correo entrante

**Elegido: Resend Inbound.** Entrega el correo ya parseado como JSON y firma el webhook, que
es lo más limpio de validar desde Deno. Su plan gratis cubre de sobra el volumen esperado
(~300 correos/mes).

**Alternativa si Inbound no estuviera en el plan gratis al implementar: SendGrid Inbound Parse**
(gratis, muy probado, pero entrega `multipart/form-data`, algo más incómodo de parsear). El
primer paso del plan debe **verificar límites y disponibilidad reales** antes de configurar MX;
el resto del diseño no cambia con el proveedor, solo el verificador de firma y la extracción
de campos.

### 6. Cliente

**Bandeja: sin UI nueva.** La sugerencia aparece en la pantalla de detectados existente. Único
ajuste: que las etiquetas no asuman "notificación de app" cuando el origen es correo (mostrar
el banco).

**Pantalla del alias (sí es nueva, y es imprescindible):** el usuario necesita ver su dirección
para crear el filtro en Gmail. Se agrega una tarjeta en **Configuración** con:
- la dirección completa `recibos+<token>@darkmoney.company` y un botón de **copiar**;
- un botón **Generar nueva dirección** (revoca la anterior) para cuando se filtre;
- una línea de ayuda con los 4 pasos del filtro de Gmail.

Sin esto la función no se puede activar.

## Seguridad

- **Inyección de sugerencias falsas:** quien conozca el alias podría mandar correos. Mitigado
  con token largo aleatorio + firma del proveedor + validación del remitente original + el hecho
  de que **nada se registra sin confirmación**. Peor caso: basura que se descarta y un alias que
  se rota.
- **Alcance del acceso:** DarkMoney solo recibe lo que el filtro reenvía. No hay credenciales de
  Gmail ni acceso al resto del correo.
- El alias es un secreto: no se registra en logs.

## Errores y observabilidad

- Firma inválida → 401, se registra en `app_error_logs` (`source: "inbound-email"`).
- Correo no reconocido → 200 `{ ignored: true }` + log `info` con el remitente (no el cuerpo,
  que trae datos financieros).
- Fallo al insertar → 500 para que el proveedor **reintente**; la idempotencia lo hace seguro.
- **Nunca** se registra el cuerpo del correo en los logs.

## Testing

- `logic.test.ts` con jest: por cada banco, correos reales anonimizados → parseo esperado.
  Casos obligatorios: monto con separador de miles, gasto vs ingreso, transferencia, correo
  no reconocido → `null`, y el disclaimer de BCP que no debe capturarse como comercio.
- Dedupe: mismo `Message-ID` dos veces → una sola sugerencia.
- `deno check` de la edge function en CI (ya existe ese job).

## Pasos manuales del usuario (una vez, ~10 min)

1. Crear cuenta en el proveedor de correo entrante.
2. Agregar los registros **MX** en Vercel DNS.
3. En Gmail: crear el filtro `de:(bcp OR yape) → reenviar a recibos+<token>@darkmoney.company`.
4. Confirmar la dirección de reenvío (Gmail envía un correo de verificación).

## Fuera de alcance (siguiente iteración si hace falta)

- Bancos distintos de BCP y Yape.
- Push en iOS (requiere Apple Developer Program).
- Registro automático sin confirmación.
- Adjuntar el correo original como comprobante del movimiento.
