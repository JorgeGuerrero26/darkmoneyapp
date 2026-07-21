# Asistente v2: registro de movimientos por chat + voz

Fecha: 2026-07-21 · Aprobado por el usuario (partes 1-5) · Épica 3 del doc de
Fase 2. Construye sobre el asistente de consulta (spec 2026-07-19-assistant-chat).

## Objetivo

Registrar movimientos hablándole o escribiéndole al asistente en lenguaje
natural ("gasté 5 en taxi", "me pagaron 3500 de sueldo", "pagué Netflix",
"pagué 80 a Juan", "transferí 200 de BCP a Interbank"), SIEMPRE con confirmación
antes de guardar. El LLM nunca inserta: propone un borrador; el usuario confirma.

## Decisiones cerradas

- Alcance: gasto, ingreso, transferencia, **pago de suscripción** y **pago/abono
  de deuda**.
- Confirmación: **tarjeta en el chat** (Guardar / Editar / Cancelar). Editar abre
  el MovementForm prellenado.
- Datos faltantes: el asistente **pregunta en el chat** con chips (no asume).
- Voz: botón de micrófono nativo (`expo-speech-recognition`, on-device, gratis) →
  requiere APK 1.0.6.
- El guardado ocurre SOLO al tocar Guardar; borrador efímero.

## Arquitectura

Enfoque elegido (A): reusar la edge function `assistant-chat` con una tool nueva
`draft_movement` que PROPONE (no inserta). El guardado lo hace el cliente con los
mutations existentes.

```
voz (expo-speech-recognition) ─┐
texto ─────────────────────────┴─→ assistant-chat (tool draft_movement)
                                     └─→ devuelve { draft } (no inserta)
                                          └─→ app: tarjeta de confirmación
                                               ├─ Guardar → createMovement /
                                               │   markSubscriptionPaid /
                                               │   createObligationPayment
                                               ├─ Editar → MovementForm prellenado
                                               └─ Cancelar → descarta
```

### Server: tool `draft_movement` en assistant-chat

- Schema tipado devuelto por el modelo (NO ejecuta escritura):
  `{ operation: "expense"|"income"|"transfer"|"pay_subscription"|"pay_debt",
     amount, currency, accountName?, destinationAccountName?, categoryName?,
     counterpartyName?, subscriptionId?, subscriptionName?, obligationId?,
     obligationCounterparty?, occurredAt?, description?, missing: string[],
     candidates?: {...} }`.
- El modelo usa el contexto que ya tiene (cuentas, categorías, deudas,
  suscripciones reales) para resolver nombres → ids. Marca en `missing` los
  campos obligatorios que faltan (típico: cuenta) y en `candidates` cuando hay
  ambigüedad (dos "Juan", varias suscripciones que coinciden).
- Fecha: si el usuario no la dice, `occurredAt` = hoy (Lima). "Ayer"/"el lunes"
  las resuelve el modelo contra la fecha actual (ya la tiene en el prompt). La
  categoría NO es obligatoria (se puede guardar sin categoría, como el form).
- Reglas en el system prompt: si `missing` no está vacío o hay ambigüedad, el
  modelo NO cierra el draft — responde preguntando (texto) y la app ofrece chips.
- La tool devuelve el draft crudo (no toca la BD). Un helper puro
  (`buildMovementDraft` en logic.ts, testeable) normaliza/valida el draft.

### Cliente

- `app/assistant.tsx`: nuevo tipo de item de chat `draft` que renderiza la
  **tarjeta de confirmación** (componente nuevo `AssistantDraftCard`): ícono por
  tipo, monto grande, líneas cuenta/categoría/contraparte/fecha, entidad
  emparejada para pagos; botones Guardar / Editar / Cancelar.
- Guardar (por tipo):
  - expense/income/transfer → `useCreateMovementMutation` (createMovement).
  - pay_subscription → `useMarkSubscriptionPaidMutation`.
  - pay_debt → `useCreateObligationPaymentMutation`.
  - `client_dedupe_key` derivado del draft (estable) → idempotente.
  - Éxito: la tarjeta pasa a "Guardado ✓" + chip "Ver movimiento".
- Editar → abre `MovementForm` prellenado con el draft (reusa validaciones).
- Cancelar → tarjeta a "Descartado".
- Chips de datos faltantes/ambigüedad: cuando el asistente pregunta, la app
  muestra las opciones (cuentas/suscripciones/deudas) como chips que, al tocar,
  mandan la respuesta al chat.
- `services/queries/assistant.ts`: extender `AssistantReply` con `draft?`.

### Voz

- `expo-speech-recognition` (config plugin, dep nativa → APK 1.0.6).
- Botón mic junto al input; press-and-hold: transcribe a texto en el input;
  al soltar, opcionalmente auto-envía. Reusa el mismo flujo de texto.
- Permiso de micrófono con copy en es-PE; si se deniega, cae al teclado (que ya
  tiene su propio mic).

## Errores y seguridad

- Mensaje ambiguo / sin monto → el modelo pide aclaración, no arma draft.
- El LLM nunca inserta: la BD solo se toca desde los mutations del cliente tras
  confirmación explícita.
- Idempotencia con client_dedupe_key; guardar dos veces no duplica.
- Cuota diaria compartida con el asistente (ai_feature_daily_usage).
- Borrador efímero: cerrar el chat sin confirmar no guarda nada.
- Emparejamiento de entidad para pagos: 1 match claro → mostrar; 0 o varios →
  preguntar, nunca adivinar.

## Pruebas

- Unit (jest, RN-free): `buildMovementDraft` (draft → MovementFormInput por tipo,
  clamps, moneda) y el emparejador de suscripción/deuda por nombre normalizado.
- E2E en dispositivo: gasto, ingreso, transferencia, "pagué Netflix" (suscripción
  correcta), "pagué a Juan" (deuda correcta), caso ambiguo (debe preguntar),
  caso sin cuenta (debe preguntar), y voz → registro.

## Fuera de alcance (v3+)

- Registrar varios movimientos en un solo mensaje (batch).
- Intención futura ("mañana voy a gastar 10") → movimiento planned + consolidación
  posterior (queda documentado en el doc de Fase 2, no en v2).
- Voz manos-libres / wake word.
