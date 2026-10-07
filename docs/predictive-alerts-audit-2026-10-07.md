# Revisión de alertas predictivas

## Resultado

El flujo tiene actividad real: la consulta agregada encontró 44 notificaciones
`cash_runway_alert`, todas con decisión `sent` en `notification_push_delivery_log`.
Esto significa que el servidor aceptó el ticket de Expo y registró el envío, **no** que
se haya confirmado recepción en cada teléfono. La alerta `commitments_vs_balance`
no tiene registros en esta consulta; no se ha validado ese caso en producción.

Las preferencias actuales incluyen dos registros Android activos con token, uno Android
inactivo con token y cuatro sin plataforma ni token. No hay registro iOS. Sin token push,
las alertas no pueden llegar al iPhone aunque antes Ajustes mostrara el interruptor activo.

## Funcionamiento del código

1. El cron `daily-notification-digest-lima-9pm` está activo con horario `0 2 * * *`
   (21:00 de Lima). No es una comprobación continua al registrar cada movimiento.
2. `send-daily-notification-digest` selecciona preferencias con push activo y token.
3. Si `predictive_alerts_enabled` está activo, revisa el workspace predeterminado:
   - `cash_runway_alert`: el saldo líquido, al ritmo medio de gasto del mes en curso,
     se agotaría antes del cierre.
   - `commitments_vs_balance`: deudas y suscripciones pendientes hasta fin de mes
     superan el saldo disponible.
4. Las alertas se crean en la bandeja y el webhook `send-push-notifications` tramita el push.
   La alerta de caja evita el límite diario por su prioridad crítica del servidor;
   la de compromisos respeta el límite de avisos importantes.
5. No se genera una alerta predictiva si no se cumple su condición. Activar el interruptor
   no envía una notificación de prueba ni asegura recibir una cada día.

## Ajustes y validación pendiente

La descripción de Ajustes explica que los avisos aparecen **solo si se prevé un riesgo**.
El interruptor queda apagado y bloqueado si push está desactivado o falta el token;
la preferencia guardada se conserva. Abrir la app ya no activa push por su cuenta.

Quedan pendientes una instalación iOS con capacidad APNs, su registro correcto y una
prueba de recepción. También falta comprobar un caso real de compromisos mayores que el saldo.
No se cambió ni desplegó la función del servidor: la evidencia del problema del iPhone
apunta al registro push, no a una ausencia general de generación o envío.

Fuentes internas: `supabase/functions/send-daily-notification-digest/index.ts`,
`supabase/functions/send-push-notifications/index.ts`,
`supabase/functions/_shared/notification-priority.ts` y consultas agregadas de solo lectura
a `notifications`, `notification_push_delivery_log`, `notification_preferences` y `cron.job`.
