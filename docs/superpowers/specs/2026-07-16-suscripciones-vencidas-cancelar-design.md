# Suscripciones: fecha vencida honesta, reactivación con recálculo y estado Cancelada

**Fecha:** 2026-07-16 · **Estado:** aprobado por el usuario · **Alcance:** solo JS (OTA), sin migraciones.

## Contexto (reporte del usuario)

1. Suscripción activa muestra "Próximo: 4 jun" estando a 16 de julio — fecha stale presentada como futura.
2. Al reactivar una pausada con fecha vencida (12 may), la fecha vieja queda; debería recalcularse según la cadencia registrada e informarse.
3. El filtro "Personalizado" no se entiende (es la frecuencia `custom` = cada N días).
4. El filtro "Canceladas" es inalcanzable: nada en la app asigna `status=cancelled` (toggle es activa↔pausada, eliminar borra la fila, el form no tiene selector de estado).

## Diseño

### 1. Card honesta con fecha vencida
`SubscriptionCard`: si `status === "active"` y `nextDueDate < hoy` → mostrar
**"Venció el {fecha}"** en color de alerta en vez de "Próximo: {fecha}". El flujo de
regularización ya existe (swipe → Pagar avanza un período por pago; si debes 2, marcas 2 —
refleja la realidad). Para `status === "cancelled"` no se muestra la línea "Próximo".
`next_due_date` NO se auto-avanza sin registro de pago: la fecha vencida es información,
no un bug de datos.

### 2. Reactivar recalcula la fecha (decisión: directo + toast)
Helper puro `rollDueDateForward(currentYmd, frequency, intervalCount, todayYmd)` en
`lib/subscription-helpers.ts`: rueda `computeNextRecurringDate` hasta la primera fecha
≥ hoy (con tope defensivo de iteraciones). Ambos toggles (lista `app/subscriptions.tsx`
y detalle `app/subscription/[id].tsx`) al pasar a `active` con fecha vencida incluyen
`nextDueDate` recalculada en el update y el toast informa: *"Reactivada. Próximo pago: 12 ago"*.
Aplica también al reactivar una cancelada.

### 3. Renombrar filtro "Personalizado" → "Cada N días"
Solo el label en `SUBSCRIPTION_FILTERS`. En el form se mantiene "Personalizado" (ahí
tiene explicación contextual).

### 4. Acción "Cancelar suscripción" (decisión: conservar historial)
En el detalle: acción "Cancelar suscripción" con confirmación → `status = "cancelled"`.
Conserva historial de pagos y puebla el filtro/sección "Canceladas" existentes.
"Eliminar" sigue borrando de verdad. Una cancelada puede reactivarse desde el detalle
(mismo toggle, con recálculo de fecha del punto 2).

## Testing
- Jest: `rollDueDateForward` (rueda multi-período, respeta fecha ya futura, custom/mensual, tope).
- Manual: card vencida en rojo; despausar la de 12 may → toast con fecha ≥ hoy; cancelar → aparece bajo filtro "Canceladas"; reactivar cancelada.
