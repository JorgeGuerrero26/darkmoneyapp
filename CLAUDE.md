# DarkMoney Claude Guide

## Project

DarkMoney es una app React Native / Expo de finanzas personales.

Trabaja como senior React Native/Expo engineer. Prioriza cambios pequeños, seguros y consistentes con el diseño existente.

## Token efficiency

- No escanees todo el repo salvo que sea necesario.
- Lee primero solo los archivos relevantes.
- No pegues archivos completos.
- No mezcles bugs distintos en una sola tarea.
- Si el usuario pide "solo plan", no edites archivos.
- Si ya hay un diagnóstico aprobado, no lo replantees salvo que una validación falle o aparezca evidencia nueva.
- Una tarea = un plan = un diff pequeño = una validación.

## Commands

Para cambios TypeScript / React Native, validar con:

- npm run typecheck
- git diff --check

Ejecutar npm run lint solo si el entorno tiene configuración ESLint válida.

Si lint falla por configuración ausente o por ESLint flat config faltante, reportarlo sin bloquear el cambio.

**OTA updates (EAS Update, canal `preview`)**: los cambios SOLO JS/assets ya no requieren
rebuild del APK. Publicar con:

```bash
npx eas-cli update --channel preview --message "descripcion del cambio"
```

El teléfono lo descarga al abrir la app y lo aplica en el siguiente arranque (2 aperturas).
Reglas: (1) cambios nativos (Kotlin, permisos, deps nativas) SÍ requieren APK y deben bumpear
`version` en app.json (runtimeVersion policy appVersion — corta la compatibilidad de updates
viejos); (2) si el update cambia el shape de datos persistidos, bumpear también el `buster`
del caché en lib/query-client.ts.

Para builds release del APK Android (cualquier cambio en `plugins/notification-detection/native-src/**/*.kt` o `android/app/src/**`), seguir `docs/BUILD_APK.md`. Reglas no negociables: sincronizar `plugins/` → `android/app/src/main/java/`, limpiar caches, build con `-P` quoteado en PowerShell, y verificar que los strings nuevos aparecen en el DEX antes de declarar el APK listo. `BUILD SUCCESSFUL` no garantiza que el cambio entró.

**APK instalable = EAS build** (la app instalada está firmada con el keystore cloud de EAS;
un build local de gradle NO puede actualizarla). Lanzar SIEMPRE con:

```bash
npm run build:android
```

que corre el preflight `scripts/preflight-native-version.mjs`: si hay cambios nativos
posteriores al último bump de `version`/`versionCode` en app.json, bloquea el build
(incidente 2026-07-11: tres binarios distintos etiquetados 1.0.1).

## Git workflow

- **Un commit por unidad lógica**, no un commit global con todo. Cada commit cuenta una sola historia: un fix, un refactor, un feature, un cambio de UX. Permite `git bisect`, revert quirúrgico y sirve de checkpoint durante refactors largos.
- Antes de stagear: `git status` y agrupar archivos por tema. Por cada grupo: `git add <archivos específicos>` + `git commit -m "..."` + verificar `npm run typecheck`. Si rompe: arreglar antes del siguiente commit.
- Push al final (o cuando el usuario lo pida).
- Mensajes en imperativo con scope al inicio: `fix(snapshot): ...`, `feat(obligations): ...`, `chore(routes): ...`, `refactor(workspace-data): ...`.
- Evitar `git add -A` cuando hay varios temas mezclados; usa rutas explícitas.
- **Refactor multi-fase**: commitear checkpoint al final de cada sub-fase aunque sea WIP. Mensaje `wip(refactor-X): fase N - <qué quedó listo>`. Esto protege contra pérdida por `git checkout`/`git restore` accidental sobre trabajo uncommitted.
- **Excepciones donde un commit grande sí aplica**: renames masivos automáticos (un solo tema), pasada de format/lint sobre todo el repo, setup inicial sin historia previa.
- Nunca usar `git checkout <file>` ni `git restore <file>` sobre archivos con trabajo uncommitted no respaldado. Revertir cambios específicos con Edit, o asegurar un commit checkpoint antes.

## Database migrations

Toda migración nueva en `supabase/migrations/` DEBE quedar documentada en `DATABASE_DICTIONARY.md` antes de cerrar la tarea.

> Nota: `DATABASE_DICTIONARY.md` está **gitignored a propósito** (doc local por máquina;
> la copia principal vive en la máquina Windows). Si el archivo no existe en la máquina
> actual, crearlo con la sección de la migración nueva — no forzar su tracking en git.

- Tabla nueva: agregar sección `### nombre_tabla` con descripción, tabla de campos (Campo / Tipo / Nulo / Descripción) e índices/uniques relevantes.
- Tipo enumerado nuevo: documentar bajo `## 4. Tipos enumerados`.
- Vista nueva: agregar a `## 6. Vistas de apoyo`.
- Columna nueva, rename, drop o cambio de tipo: actualizar la tabla afectada.

No cerrar la tarea si modificaste el esquema y no actualizaste el diccionario.

## Architecture

- app/* orquesta estado, queries, callbacks y slots.
- components/ui/* contiene componentes genéricosio ni consultas.
- components/domain/* y features/*/components/* contienen wrappers de dominio.
- features/*/lib/* contiene filtros, presenters, labels y builders de secciones.
- services/queries/* contiene Supabase, React Query, mappers e invalidaciones.
- Los componentes visuales reciben datos listos.
- Los componentes visuales no consultan Supabase.
- Los componentes visuales no calculan reglas financieras complejas.

## Resource modules

Las pantallas tipo recurso deben usar ResourceModuleTemplate con este orden:

1. header
2. toolbar
3. activeFilters
4. context
5. summary
6. bulkActions
7. list
8. fab
9. overlays

Usar componentes compartidos:

- HeaderActionGroup
- FilterToolbar
- ActiveFilterBar
- ResourceContextNote
- MetricSummaryBar
- BulkActionBar
- ResourceSectionList
- ResourceCard
- SwipeActionRow
- FAB
- CurrencySelector

## UI rules

- Usar tokens de constants/theme.ts:
  - COLORS
  - GLASS
  - SPACING
  - RADIUS
  - FONT_FAMILY
  - FONT_SIZE
- No introducir colores hex, radios, sombras o fuentes inline sin justificación.
- No agregar marginHorizontal dentro de rows/cards.
- Las cards deben mantener ancho consistente entre módulos.
- No crear listas, cards, filtros, FABs o summary bars duplicados si ya existe componente compartido.
- Mantener una estética dark fintech premium, limpia y consistente.

## Filters

- Usar filtros tipados.
- Si varios filtros se combinan, usar multiselección.
- Mostrar filtros activos en ActiveFilterBar.
- ActiveFilterBar debe permitir remover filtros individuales y limpiar todos.
- FilterToolbar emite cambios; no filtra internamente.
- ResourceContextNote no reemplaza filtros activos.

## Currency

- La moneda base se elige con CurrencySelector.
- La moneda base debe venir de settings y monedas soportadas.
- Usar USD como referencia por defecto para comparaciones.
- No hardcodear PEN/USD ni tasas manuales.
- Usar tipos de cambio persistio sincronizados.

## Navigation

- Si un módulo se abre desde Más, la ruta debe usar ?from=more.
- Usar useOriginBackNavigation.
- No usar router.back() directo en módulos abiertos desde Más.
- El back debe volver al origen real, no siempre al dashboard.
- Android back gesture / hardware back debe estar cubierto cuando aplique.
- iOS / React Navigation beforeRemove debe estar cubierto cuando aplique.

## Android notification detection

El sistema de detección de notificaciones tiene una arquitectura dual que es fácil de romper. Reglas críticas:

### Dual file locations — SIEMPRE sincronizar

Los archivos Kotlin existen en dos rutas. Gradle compila SOLO desde `android/app/src/main/java/`:

- Fuente editable: `plugins/notification-detection/native-src/notificationdetection/*.kt`
- Fuente compilada: `android/app/src/main/java/com/darkmoney/app/notificationdetection/*.kt`

Después de editar cualquier `.kt` en `plugins/`, copiar al path de `android/`:
```bash
cp plugins/notification-detection/native-src/notificationdetection/Foo.kt \
   android/app/src/main/java/com/darkmoney/app/notificationdetection/Foo.kt
```

### Verificar el APK antes de instalar

`BUILD SUCCESSFUL` no garantiza que los cambios Kotlin entraron. Verificar siempre:
```bash
cd /tmp && unzip -o .../app-release.apk 'classes*.dex' -d apk_extracted
strings apk_extracted/classes*.dex | grep "texto esperado"
```

### Forzar recompilación cuando el cache Gradle está stale

```bash
rm -rf android/.gradle android/app/build/tmp/kotlin-classes android/app/build/intermediates/dex
./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

### Logs nativos en release builds

`Log.d` es filtrado en release builds en Samsung/Android 12+. Para debugear usar:
```bash
adb -s <ID> shell dumpsys notification --noredact | grep -A20 "darkmoney"
adb -s <ID> logcat -d 2>&1 | grep "NotificationManager.*darkmoney"
```

### Cleanup de notificaciones stale

Hay dos mecanismos de limpieza:
1. `cancelStalePendingNotifications()` en `onListenerConnected` — limpia al conectar el servicio
2. `NOTIF_CLEANUP_KEY` en `NotificationDetectionModule.setRuntimeContext` — limpia una vez al abrir la app con nuevo APK. Bumper la key `"YYYY-MM-DD-vN"` cuando necesites forzar limpieza.

### Detección de emails de Gmail

- No llamar `extractFinancialEmailMerchant` para `movementType == "transfer"` — retornar `"Transferencia $bankLabel"` directamente
- El patrón `\ben\s+` del extractor puede capturar el disclaimer de BCP "en sorteos o promociones" si aparece antes del char 400. Restringir a `.take(400)` ayuda pero no siempre es suficiente

### Notification ID estable

Usar `notificationIdFor("${sourcePackage}:${amount}:${System.currentTimeMillis() / 600_000}")` para evitar duplicados cuando Gmail dispara `onNotificationPosted` múltiples veces con diferente contenido.

## Skills

Las skills locales viven en .claude/skills/ o .agents/skills/.

Usar skills cuando aplique:

- darkmoney-resource-module: crear o migrar módulos tipo recurso.
- darkmoney-module-audit: auditar módulos contra el estándar.
- darkmoney-origin-back-navigation: revisar o corregir navegación de retroceso por origen.
- darkmoney-notification-detection: debugear, extender o corregir el sistema de detección de notificaciones Android (Kotlin nativo, Gradle build, ADB, capa RN/TypeScript).

## Validation checklist

Antes de cerrar una tarea que cambió código, confirmar:

- npm run typecheck pasa.
- git diff --check pasa.
- npm run lint se ejecutó solo si el entorno tiene ESLint válido.
- No se modificaron archivos fuera del alcance.
- No se rompió ResourceModuleTemplate.
- No se introdujeron listas/cards/filtros duplicados.
- No se hardcodearon monedas, tasas, secretos ni URLs productivas.

## Final response

Al terminar una tarea, responder con:

- Archivos modificados.
- Qué cambió.
- Comandos ejecutados y resultado.
- Cómo probar manualmente.
- Riesgos, supuestos o pendientes.
