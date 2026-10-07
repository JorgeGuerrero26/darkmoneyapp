# Detección de comprobantes por correo (Resend)

Configuración vigente desde el 7 de octubre de 2026. Sustituye la integración anterior
de SendGrid descrita en los documentos de diseño de julio. El dominio receptor es
`recibos.darkmoney.company`, administrado por DNS de Vercel y verificado en Resend.

## Flujo

Banco → filtro de Gmail → `recibos+<token>@recibos.darkmoney.company` → Resend
`email.received` → función Supabase `inbound-email-detection` → sugerencia pendiente
y notificación interna → confirmación del usuario. Funciona en iOS y Android.

Las notificaciones en pantalla bloqueada son una integración distinta. Este receptor
crea avisos `in_app`; no promete un push nativo ni registra movimientos automáticamente.

## DNS

- MX: nombre `recibos`, servidor `inbound-smtp.sa-east-1.amazonaws.com`, prioridad 10.
- TXT: nombre `resend._domainkey.recibos`, valor DKIM completo generado por Resend.
- Sending desactivado y Receiving activado en este subdominio.
- El MX recibe el correo y el TXT verifica el nuevo dominio: ambos deben existir.

No usar valores recortados en capturas. No modificar los registros del dominio principal.

## Secretos y webhook

1. Crear una clave separada de Resend con permiso **Full access** para leer correos recibidos.
2. Guardarla en Supabase → Edge Functions → Secrets como `RESEND_INBOUND_API_KEY`.
   No cambiar `RESEND_API_KEY`: lo usan los correos salientes de créditos y deudas.
3. Crear un webhook en Resend con evento `email.received` y destino:
   `https://cawrdzrcipgibcoefltr.supabase.co/functions/v1/inbound-email-detection`.
4. Guardar su Signing secret (`whsec_…`) como `RESEND_INBOUND_WEBHOOK_SECRET` en Supabase.
5. Desplegar:

```powershell
npx supabase functions deploy inbound-email-detection --project-ref cawrdzrcipgibcoefltr --no-verify-jwt --use-api
```

JWT está desactivado porque el proveedor llama sin sesión. La función verifica la firma
Svix sobre el cuerpo original, incluyendo id y timestamp con tolerancia de cinco minutos.
Los secretos nunca deben aparecer en URLs, commits, capturas o logs. Sin ambos secretos,
la función responde 503; una firma incorrecta responde 401.

El webhook contiene metadata, no el cuerpo. La función obtiene el correo con
`GET /emails/receiving/:email_id`, con timeout de ocho segundos. Fallos del proveedor o
de la base responden 500 para que Resend reintente.
Cuando Gmail conserva el To original, la dirección del alias se obtiene de `received_for`
en la respuesta API de Resend. No buscar direcciones privadas dentro del cuerpo del correo.

## Configurar Gmail durante el piloto

1. Actualizar la app por OTA y generar/copiar el alias privado del workspace en Configuración.
2. En Gmail de escritorio, añadirlo en Configuración → Reenvío.
3. **El mensaje de confirmación se consulta en Resend → Emails → Receiving.** Abrirlo y
   completar la confirmación en Gmail. En este piloto el administrador accede a ese panel;
   aún no hay una bandeja de códigos de verificación dentro de DarkMoney para otros usuarios.
4. Crear filtros limitados a comprobantes. BCP usa `notificaciones@notificacionesbcp.com.pe`;
   contrastar asunto y contenido con correos reales. No reenviar promociones ni toda la bandeja.
5. Conservar copia del original. El reenvío automático debe conservar el From del banco;
   reenviar manualmente cambiando el remitente a Gmail no demuestra reconocimiento bancario.

Para probar infraestructura puede usarse `prueba@recibos.darkmoney.company`, pero no
crea una sugerencia: solo aliases activos con token reciben detecciones.

## Reglas y reintentos

- Reconoce actualmente BCP y Yape. No inferir nuevos remitentes: obtener muestras primero.
- Admite From con nombre, texto y HTML; no procesa comprobantes solo adjuntos en PDF.
- Transfiere entre cuentas propias solo con el campo que lo confirma; una transferencia
  genérica no debe clasificarse automáticamente como propia.
- Lee las fechas bancarias en UTC-5. Si no reconoce la fecha, usa la recepción original,
  no el momento de un reintento. Metadata indica `dateSource`.
- Autenticación DKIM o DMARC válida según el servidor de Resend: pendiente normal. Fallo
  explícito sin señal válida: ignorado. Resultado desconocido: `needs_review`.
- Deduplica por banco, fecha y número de operación; luego Message-ID o contenido como respaldo.
  No descartar correos solo porque otro movimiento tenga el mismo importe. La revisión de
  posibles duplicados de otros orígenes se mantiene al confirmar en el formulario existente.
- La sugerencia y el aviso se guardan en dos operaciones. Un reintento recupera el aviso
  faltante y conserva avisos ya leídos; no reabre sugerencias registradas/descartadas.
- El alias debe seguir activo y el usuario debe seguir perteneciendo al workspace.
- No guardar cuerpo completo, últimos dígitos de tarjeta o claves en logs/metadata.

## Validación

```powershell
npx jest supabase/functions/inbound-email-detection --runInBand
npm run typecheck
git diff --check
```

Prueba real pendiente hasta configurar ambos secretos y el webhook: consumo BCP → sugerencia
en iPhone → confirmar una vez; transferencia propia; repetir webhook sin duplicar; dos
operaciones diferentes del mismo importe; conservar fecha original del comprobante.

Resend Free comparte los límites de 3.000 correos/mes y 100/día entre enviados y recibidos
de toda la cuenta. Revisar consumo antes de abrir el piloto a más usuarios.

Referencias: [recepción](https://resend.com/docs/dashboard/receiving/create-receiving-webhook),
[firmas](https://resend.com/docs/webhooks/verify-webhooks-requests),
[contenido](https://resend.com/docs/api-reference/emails/retrieve-received-email).
