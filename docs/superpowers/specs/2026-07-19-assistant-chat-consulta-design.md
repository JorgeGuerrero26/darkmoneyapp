# Asistente IA de consulta de movimientos (Fase 2 — v1 solo lectura)

Fecha: 2026-07-19 · Aprobado por el usuario (enfoque A + defaults) · Épicas 1-2
del doc de Fase 2. v2 (registro por chat) queda fuera de este spec.

## Problema

Encontrar un dato histórico ("¿cuánto me costó el mouse Viper V3 Pro hace 6
meses?") exige filtrar a mano. El usuario quiere preguntar en lenguaje natural
y recibir cifra + evidencia abrible, y resúmenes de período ("¿cuánto gasté en
comida el mes pasado?", "¿gasté mucho?").

## Decisiones cerradas

- v1 SOLO consulta (movimientos + resúmenes/comparaciones). Sin escrituras.
- Proveedor: DeepSeek (`deepseek-chat`, ya usado en daily-ai-digest) con
  function calling estilo OpenAI, server-side. La key NUNCA va al cliente.
- Loop de herramientas en la edge function, máximo 3 rondas por pregunta.
- El modelo solo narra resultados de queries; prohibido inventar cifras.
- Conversación efímera (en memoria de la pantalla). Persistencia = v2.
- Cuota diaria por workspace reutilizando `ai_feature_daily_usage`
  (feature_key `assistant_chat`, 30 preguntas/día).
- Evidencia clickeable que abre Movimientos con `quickMovementIds`+`quickLabel`.
- Contratos tipados locales en v1; migrar a `@darkmoney/shared` cuando la web
  los necesite (la dep es github:, editarla es otro repo/ciclo).

## Arquitectura

```
app/assistant.tsx (chat UI, efímero)
  └─ services/queries/assistant.ts → invokeEdgeFunction("assistant-chat")
       └─ supabase/functions/assistant-chat/index.ts
            ├─ auth: JWT del usuario + cliente RLS (workspace del usuario)
            ├─ cuota: ai_feature_daily_usage (assistant_chat, 30/día)
            ├─ loop DeepSeek tools (≤3 rondas):
            │    search_movements(params) → SQL RLS (≤40 filas compactas)
            │    summarize_movements(params) → agregados SQL
            └─ respuesta { reply, evidence[], remainingToday }
```

### Herramientas (2, suficientes: el loop compone comparaciones llamando
summarize dos veces)

`search_movements`:
- Entrada: `{ text?, minAmount?, maxAmount?, dateFrom?, dateTo?, movementType?,
  categoryName?, limit=20 (máx 40) }`.
- SQL: movements del workspace activo, RLS aplicada; `ilike` sobre description,
  notes y nombre de counterparty; joins a categories/counterparties para
  nombres; orden occurred_at desc, id desc (estable); sin límite de antigüedad.
- Salida por fila (compacta, para no quemar tokens): `{ id, date, type, amount,
  currency, description, category, counterparty }`.

`summarize_movements`:
- Entrada: `{ dateFrom, dateTo, movementType?, categoryName?,
  groupBy?: "category" | "counterparty" | "none" }`.
- Salida: `{ total, count, currency, groups?: [{ name, total, count }] (top 10),
  topMovementIds: number[] }`.

### Edge function `assistant-chat`

- POST `{ message: string, history: { role, content }[] (≤8 turnos previos),
  workspaceId: number }`. El history viaja del cliente (efímero) para dar
  contexto conversacional; solo texto, nunca resultados completos de tools.
- Auth con el patrón de obligation-share-utils (`authenticatedUser`); las
  queries usan un cliente con el JWT del usuario → RLS decide el acceso, y
  se verifica pertenencia al workspaceId pedido.
- System prompt (es-PE): rol **contador interno** (ampliado 2026-07-19 a pedido
  del usuario — "no un bot, un contador inteligente"): además de responder
  corto con SOLO cifras de herramientas, ANALIZA — correlaciona compra/venta
  por descripción, contraparte o monto similar, calcula ganancia y margen %,
  compara contra los hábitos del usuario pidiendo contexto extra a las tools,
  opina fundamentado y es honesto cuando la correlación es dudosa. Negritas
  solo en montos/ganancias/márgenes; hasta ~200 palabras en análisis; 4 rondas
  de tools; las filas incluyen `notes` (ahí vive el detalle correlacionable).
  Este rol se hereda al registro por chat (v2).
- Fechas relativas ("hace 6 meses") las resuelve el MODELO al armar los
  parámetros; el server valida formato YYYY-MM-DD y rangos sanos.
- Evidencia: la función acumula los ids de los resultados usados en la última
  ronda y responde `evidence: [{ label, movementIds (≤100) }]`.
- Errores: cuota agotada → 429 con `remainingToday: 0` y mensaje amable;
  DeepSeek caído/timeout (25 s) → 502 con mensaje "inténtalo de nuevo";
  pregunta fuera de dominio → el modelo responde sin tools (respuesta corta).
- Auditoría v1 minimizada: console.log de `{ userId, workspaceId, chars de la
  pregunta, tools llamadas, filas devueltas }` (logs de Supabase con retención
  propia). Sin tabla nueva (v2 si hace falta análisis).
- Cache: no aplica (preguntas únicas); la cuota es el control de costo.

### Cliente

- `app/assistant.tsx`: lista de burbujas (usuario/asistente) + input + enviar;
  estado "pensando" (indicador); errores con reintento; contador discreto de
  preguntas restantes. Estética dark fintech con tokens del tema; sin libs
  nuevas de chat (FlatList invertida + estilos propios).
- Chips de evidencia bajo cada respuesta: "Ver N movimientos" →
  `router.push('/(app)/movements?quickMovementIds=..&quickLabel=..&from=assistant')`.
- Navegación: `useOriginBackNavigation`; se abre con `?from=dashboard` o
  `?from=more`; back vuelve al origen real (regla del repo).
- Entradas: icono Sparkles en el header del dashboard + item "Asistente" en Más.
- `services/queries/assistant.ts`: `askAssistant({ message, history,
  workspaceId })` vía `invokeEdgeFunction` (maneja sesión/refresh); tipos
  `AssistantMessage`, `AssistantEvidence`, `AssistantReply`.

## Errores y límites

- Sin red / timeout: burbuja de error con botón reintentar (reenvía el mismo
  mensaje); el input conserva el texto.
- Cuota agotada: burbuja informativa; input deshabilitado hasta mañana.
- Workspace sin movimientos: el modelo responde honesto ("no encontré nada").
- Prompt injection en datos (descripciones con instrucciones): mitigado porque
  las filas viajan como JSON de datos en el mensaje de tool y el system prompt
  fija que el contenido de los movimientos es DATO, no instrucción.

## Pruebas

- Unit (jest, RN-free): builder de parámetros SQL de `search_movements`
  (escapado de ilike, clamps de limit/fechas) y armado de evidencia.
- Manual en dispositivo: caso mouse ("cuánto me costó el viper v3 pro"),
  resumen ("cuánto gasté en comida el mes pasado"), comparación ("¿gasté más
  que el mes anterior?"), cuota, sin red, evidencia que abre Movimientos.
- La edge function se prueba desplegada con curl autenticado antes de tocar UI.

## Fuera de alcance (v2+)

Registro por chat (épica 3), historial persistente, voz, más dominios (deudas,
suscripciones, presupuestos), streaming de respuesta, migración de contratos a
@darkmoney/shared.
