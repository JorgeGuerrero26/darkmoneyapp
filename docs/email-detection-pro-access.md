# Detección por correo: acceso PRO

## Comportamiento

- Configuración muestra «Detectar pagos por correo» con etiqueta PRO.
- Free abre un aviso con «Ahora no» y «Ver PRO». La segunda acción abre `/pricing` del sitio.
- PRO abre la configuración de su dirección privada.
- Un error al consultar el plan ofrece reintentar; no se interpreta como plan Free.
- La recepción se pausa al vencer el permiso y reutiliza la dirección al renovar.
- Las sugerencias pendientes por correo requieren PRO para abrir su formulario y guardar.
- Los movimientos ya registrados conservan sus permisos habituales de consulta y edición.
- El bloque de revisión en el dashboard avanzado queda pendiente del diseño solicitado.

## Fuente de permiso

`has_email_detection_pro_access` consulta `user_entitlements` en Supabase. Requiere
`pro_access_enabled` y un periodo vigente, sin fecha de fin, o un `manual_override` activo.
No depende del modo visual del dashboard. Las consultas autenticadas solo pueden consultar
su propio usuario; el webhook puede consultar al destinatario con `service_role`.

La migración `202610070001_email_detection_pro_access.sql` conserva el permiso manual del
administrador que la app ya reconocía, únicamente cuando no existe un entitlement explícito.
Los planes existentes y la facturación no se modifican.

## Protección del servidor

- Las políticas de `inbound_email_aliases` requieren propietario, membresía y PRO.
- El webhook consulta PRO antes de recuperar el cuerpo y antes de guardar la sugerencia.
- Un trigger protege INSERT/UPDATE de sugerencias `email:inbound`, también desde service role.
- No se permite cambiar el origen entre correo y Android.
- Un trigger en INSERT de `movements` revisa `metadata.suggestionId` cuando apunta a correo:
  protege versiones anteriores que crean el movimiento antes de actualizar la sugerencia.
- Las sugerencias Android conservan sus reglas actuales.

El esquema, índice y reglas están documentados también en `DATABASE_DICTIONARY.md`, que el
repositorio mantiene como archivo local ignorado.

## Validación

- `npm run typecheck` y `git diff --check`.
- Jest: 41 pruebas del parser, firma, reintentos y control PRO del webhook.
- `deno check supabase/functions/inbound-email-detection/index.ts`.
- `node scripts/test-email-detection-pro.mjs`: 20 comprobaciones de permisos con usuarios,
  cuentas y movimientos ficticios. Ejecuta la migración dentro de una transacción y siempre
  revierte los datos y el esquema al terminar. No imprime credenciales ni direcciones reales.
- La revisión visual del aviso en el iPhone queda pendiente; no se modificaron listas ni gestos.
- ESLint no ejecuta por falta de `eslint.config.*` compatible con ESLint 10 en este repo.
