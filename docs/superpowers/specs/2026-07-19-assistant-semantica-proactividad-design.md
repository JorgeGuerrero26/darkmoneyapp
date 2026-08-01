# Asistente: búsqueda semántica + proactividad (Fase 2b)

Fecha: 2026-07-19 · Decisiones del usuario: proactividad semanal + anomalías;
tap en insight abre el chat y envía la pregunta solo.

## 1. Búsqueda semántica (encuentra "el mouse gamer" → "Viper V3 Pro")

- **Proveedor**: Gemini embeddings (`gemini-embedding-001`, 768 dims,
  multilingüe; GEMINI_API_KEY ya existe en secrets). Env
  `GEMINI_EMBEDDING_MODEL` con default.
- **Almacén**: pgvector 0.8 (extensión disponible, se activa en la migración).
  Tabla `movement_embeddings(movement_id pk→movements cascade, workspace_id,
  embedding vector(768), source_hash, created_at)`. SIN índice ANN a propósito:
  ~700 movimientos, seq scan sobra (agregar HNSW si un workspace supera ~50k).
  RLS: select para miembros; escrituras solo service role.
- **Indexado LAZY, sin pipeline**: al ejecutar una búsqueda con texto, la edge
  function embebe on-demand los movimientos del workspace que aún no tienen
  embedding (lotes de 100, texto = descripción+notas+categoría+contraparte;
  source_hash para re-embeber si el texto cambió). Cero crons/triggers a esta
  escala; si el volumen crece, se agrega cron de backfill.
- **Búsqueda híbrida transparente**: `search_movements` primero hace keyword
  (ilike); si hay <3 resultados y hay texto, corre semántica: embebe la query
  (RETRIEVAL_QUERY), RPC `match_movements(ws, vector, n)` (security invoker,
  respeta RLS vía join) y mergea sin duplicar. El modelo no decide nada nuevo.

## 2. Proactividad (el contador habla primero)

- **Cadencia**: semanal (lunes 09:00 Lima) + anomalías (diario 21:00 Lima).
  Cron pg_cron + pg_net → edge function `proactive-insights` con el webhook
  secret del digest (mismo dominio de confianza).
- **Detección por REGLAS, sin LLM** (barato y explicable):
  - Semanal: gasto por categoría últimos 7d vs promedio semanal de los 28d
    previos; reporta subidas ≥25% y ≥ S/50, y el total de la semana.
  - Anomalía: gasto del día > 2.5× el promedio de su categoría (90d) y
    ≥ S/100; máx. 1 notificación de anomalía por día.
- **Entrega**: filas en `notifications` (pipeline existente de inbox + push),
  kind `assistant_insight`, metadata con `assistantPrompt` (la pregunta que
  el insight invita a hacer).
- **Tap → análisis**: lib/notification-navigation.ts rutea kind
  `assistant_insight` a `/assistant?ask=<pregunta>`; la pantalla auto-envía
  `ask` una sola vez al montar (decisión del usuario: pregunta sola, no
  prellenada). La respuesta profunda la da el chat con sus herramientas —
  la notificación solo detecta y invita.

## Fuera de alcance

Índice ANN, re-embedding masivo ante cambios de modelo, insights con LLM en la
detección, configuración de umbrales por usuario (v2 si el ruido molesta).
