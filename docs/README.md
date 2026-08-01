# Documentación de DarkMoney

Índice de `docs/`. Regla: **guía viva** se mantiene al día con el código; **histórico** es un snapshot fechado que no se actualiza (vive en `archive/`).

## Guías vivas

| Doc | Contenido |
|---|---|
| [`APP_DESIGN_AND_CODE_PATTERNS.md`](APP_DESIGN_AND_CODE_PATTERNS.md) | Patrones de diseño y código de la app |
| [`BUILD_APK.md`](BUILD_APK.md) | Pipeline de build Android (EAS, doble path Kotlin, verificación DEX) |
| [`UNIVERSAL_LINKS.md`](UNIVERSAL_LINKS.md) | Deep links e invitaciones |
| [`SCHEMA_OBLIGATION_EVENTS.md`](SCHEMA_OBLIGATION_EVENTS.md) | Esquema de eventos de obligaciones |

## Roadmap

| Doc | Contenido |
|---|---|
| [`DARKMONEY_PHASE_2_INCOMING_FEATURES.md`](DARKMONEY_PHASE_2_INCOMING_FEATURES.md) | Fase 2: fundaciones, reportes históricos, chat IA, insights |

## Specs y planes por feature

`superpowers/specs/` (diseño) y `superpowers/plans/` (plan de implementación), fechados por feature — p. ej. `2026-07-14-duplicados-ia`. Son el registro de cómo se decidió y construyó cada feature grande.

## Histórico (`archive/`)

Snapshots point-in-time; el código actual puede diferir. No usar como fuente de verdad.

| Doc | Fecha | Qué era |
|---|---|---|
| [`OBLIGATIONS_MODULE_AUDIT.md`](archive/OBLIGATIONS_MODULE_AUDIT.md) | 2026-05-04 | Auditoría del módulo Créditos y Deudas |
| [`AUDITORIA_REGISTRO_MOVIMIENTOS.md`](archive/AUDITORIA_REGISTRO_MOVIMIENTOS.md) | 2026-06-10 | Auditoría de las 4 vías de registro de movimientos |
| [`REGISTRO_MOVIMIENTOS_REVISION.md`](archive/REGISTRO_MOVIMIENTOS_REVISION.md) | 2026-06 | Revisión técnica del registro de movimientos |
| [`OBLIGATIONS_MODULARIZATION_PLAYBOOK.md`](archive/OBLIGATIONS_MODULARIZATION_PLAYBOOK.md) | 2026-06/07 | Playbook del refactor de obligations (completado; útil como método) |

## Otros docs del repo

- `README.md` (raíz) — presentación del proyecto, stack, comandos, releases.
- `CLAUDE.md` / `AGENTS.md` — guía operativa para agentes y devs (arquitectura, validación, detección Android).
- `DATABASE_DICTIONARY.md` (raíz, **gitignored a propósito**) — diccionario del esquema; copia local por máquina, la principal vive en la máquina Windows.
