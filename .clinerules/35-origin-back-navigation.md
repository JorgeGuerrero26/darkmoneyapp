# Origin-Aware Back Navigation Rules

## Objetivo

Todo módulo o pantalla secundaria de DarkMoney debe volver al origen real desde donde fue abierta.

No asumir que el destino de retroceso siempre es dashboard. El usuario puede venir desde:

- Más.
- Dashboard.
- Una card del home.
- Un módulo relacionado.
- Notificaciones.
- Search.
- Un flujo profundo.
- Una pantalla modal/sheet.
- Una ruta anterior del stack.

## Regla principal

Cuando una pantalla pueda abrirse desde más de un origen, debe usar navegación origin-aware.

Preferir el hook central existente:

```ts
useOriginBackNavigation
```

No implementar lógica local de back si el hook cubre el caso.

## Parámetro de origen

Cuando una pantalla se abre desde un origen explícito, pasar un parámetro de origen en la ruta.

Ejemplos:

```ts
?from=more
?from=dashboard
?from=notifications
```

Si el proyecto adopta `returnTo` u otro parámetro en el futuro, mantenerlo centralizado en el hook o helper de navegación.

## Comportamiento esperado

- La flecha del header debe volver al origen correcto.
- El gesto de retroceso de Android debe volver al origen correcto.
- El botón físico de retroceso Android debe volver al origen correcto.
- El swipe-back de iOS debe volver al origen correcto cuando aplique.
- Si no existe origen explícito, usar el comportamiento normal del stack.
- Solo usar fallback seguro cuando no hay origen ni historial válido.
- Nunca hardcodear dashboard como destino universal.

## Android

En Android, el gesto/botón de retroceso del sistema puede requerir `BackHandler`.

Si se modifica navegación origin-aware, verificar que el hook central cubra:

```ts
BackHandler.addEventListener('hardwareBackPress', ...)
```

El handler debe retornar:

- `true` cuando consume el evento y ejecuta navegación origin-aware.
- `false` cuando no hay origen y debe continuar el comportamiento normal.

## iOS / React Navigation

Para navegación gestionada por React Navigation, el hook puede necesitar interceptar:

```ts
navigation.addListener('beforeRemove', ...)
```

Esto no reemplaza `BackHandler` en Android. Ambos mecanismos pueden ser necesarios.

## Reglas para nuevos módulos

Cuando se cree un nuevo módulo que se abra desde `Más`:

- La ruta debe recibir `?from=more`.
- El back debe usar `useOriginBackNavigation`.
- No usar `router.back()` directo si la pantalla puede venir desde `Más`.
- No navegar directamente a dashboard como fallback inicial.
- Registrar la pantalla como oculta en `app/(app)/_layout.tsx` con `href: null` si corresponde al patrón del proyecto.

Cuando se cree un módulo que pueda abrirse desde varios puntos:

- Definir los orígenes posibles.
- Pasar `from` o el parámetro estándar del proyecto.
- Usar el hook central para resolver el destino.
- Probar el back desde cada origen relevante.

## Prohibido

- No usar `router.back()` directo en pantallas origin-aware.
- No usar dashboard como destino fijo para todos los retrocesos.
- No duplicar lógica de back en cada módulo.
- No crear handlers locales de `BackHandler` si el hook central puede cubrirlo.
- No romper el comportamiento normal cuando no existe origen explícito.

## Validación manual obligatoria

Cuando se modifique navegación de módulos:

Probar en Android real o emulador:

- Entrar desde `Más`.
- Retroceder con flecha del header.
- Entrar otra vez desde `Más`.
- Retroceder con gesto/botón del sistema.
- Confirmar que vuelve a `Más`, no a dashboard.

Probar también:

- Entrar desde dashboard, si aplica.
- Entrar desde otra pantalla, si aplica.
- Confirmar que vuelve al origen correcto.

## Validación técnica

Ejecutar:

```bash
npm run typecheck
git diff --check
```

Ejecutar `npm run lint` solo si el entorno tiene configuración ESLint válida.

## Formato de cierre

Si se toca navegación, reportar:

- Archivos modificados.
- Orígenes cubiertos.
- Hook usado.
- Si se cubrió Android `BackHandler`.
- Si se cubrió `beforeRemove`.
- Validación ejecutada.
- Pruebas manuales recomendadas.