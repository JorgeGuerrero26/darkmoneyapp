# Prompt para Codex — Fases 3 y 4 del motor offline

Copiar el bloque de abajo tal cual.

```
Trabajas en DarkMoney (React Native / Expo, Supabase). Lee CLAUDE.md primero (reglas del repo, en español).

CONTEXTO
Hay un motor offline propio (SQLite + cola de operaciones + sync) ya hecho para MOVIMIENTOS (Fase 2).
Documentos, en este orden:
  1. docs/OFFLINE_ENGINE_DESIGN.md      diseño general
  2. docs/OFFLINE_PHASE1_PLAN.md        servidor (ya en producción)
  3. docs/OFFLINE_PHASE2_PLAN.md        cliente de movimientos = el patrón a repetir
  4. docs/OFFLINE_PHASE3_PLAN.md        TU TAREA, parte 1 (catálogos, presupuestos, suscripciones, ingreso recurrente, plantillas, metas)
  5. docs/OFFLINE_PHASE4_PLAN.md        TU TAREA, parte 2 (obligaciones y workspaces compartidos)
Código del motor: lib/offline/**. Integración con React Query: services/queries/workspace-data.ts
(busca useCreateMovementMutation y usePaginatedMovements: ahí está el patrón exacto).

TAREA
Ejecuta la Fase 3 completa y, solo cuando la 3 esté verde, la Fase 4, siguiendo las etapas de cada plan.
Si encuentras que un plan se equivoca (columna que no existe, trigger distinto, etc.), corrige el plan en
su .md y sigue; no improvises en silencio. Si una decisión cambia dinero o semántica de negocio y el plan
no la cubre, detente en esa etapa y déjala anotada en el plan bajo "Preguntas abiertas" en vez de adivinar.

REGLAS NO NEGOCIABLES
- NO hagas git commit, git push ni git add. El dueño decidirá. Deja todo como cambios sin commitear.
- NO apliques migraciones a producción ni publiques OTA/EAS. Las migraciones se escriben en
  supabase/migrations/ y se prueban en PGlite (npm run test:offline-e2e). Cualquier consulta a la base real
  es SOLO LECTURA dentro de una transacción que termina en ROLLBACK (mira .tmp/offline-fixtures/engine-vs-prod.mjs
  y los scripts m3.mjs como ejemplo; las credenciales están en .env, nunca las imprimas ni las copies a archivos).
- El árbol de trabajo tiene cambios sin commitear del dueño (app/subscriptions.tsx, features/subscriptions/**,
  lib/subscription-helpers.ts, features/notifications/**, app/(app)/more.tsx, .github/workflows/db-backup.yml,
  docs/RESTORE_BACKUP.md). NO los reviertas, no los reformatees, no uses git checkout/restore/stash/reset sobre
  ellos. Si tu tarea los toca, edita lo mínimo y avísalo en tu reporte.
- Apagado por defecto: todo detrás del interruptor beta existente. Con el interruptor apagado la app debe
  comportarse EXACTAMENTE igual que antes (no cambies firmas públicas de hooks ni textos para quien no lo active).
- El módulo nativo expo-sqlite se carga con require protegido (lib/offline/expo-driver.ts): no importes expo-sqlite
  de forma estática en ningún otro sitio.
- Dinero en centavos enteros en SQLite, nunca REAL. IDs reales reservados con el pool (reserve_ids), nunca inventados.
- Nunca edites una migración ya publicada: ni de Supabase (<= 202610120003) ni de SQLite (v1 en lib/offline/schema.ts);
  añade migraciones nuevas al final.
- Réplicas de cálculos del servidor (v_budget_progress, v_obligation_summary, etc.): solo si pasan una prueba de
  paridad contra datos reales (fixtures en .tmp/offline-fixtures, gitignored, se regeneran con lecturas); si no
  hay paridad exacta, no ocultes el valor del servidor.
- UI: tokens de constants/theme.ts, componentes compartidos (ResourceModuleTemplate, slot context), nada de
  componentes duplicados, textos en español llano (docs/CHANGELOG_STYLE.md). No toques detachInactiveScreens.
- Cada migración nueva de servidor se documenta en DATABASE_DICTIONARY.md (archivo local, gitignored: créalo/edítalo
  sin forzar su tracking).
- Estilo del código: igual que el circundante (comentarios en español, mismo grado de densidad, mismos nombres).

VALIDACIÓN (corre al cerrar cada etapa y reporta resultados reales, incluidos los fallos)
  npm run typecheck
  npm test
  npm run test:offline-e2e
  git diff --check
Las pruebas automáticas NO verifican el iPhone. Añade los casos nuevos a docs/OFFLINE_DEVICE_TEST.md y deja
explícito que la prueba en dispositivo está pendiente; no declares nada "listo en iPhone".

ENTREGABLE al terminar (o al detenerte):
  - Lista de archivos creados/modificados (con enlaces a ruta:línea).
  - Qué etapa quedó hecha, cuál a medias, qué preguntas abiertas hay.
  - Resultado literal de los 4 comandos de validación.
  - Qué hay que probar a mano en el teléfono.
  - Riesgos y supuestos.
```
