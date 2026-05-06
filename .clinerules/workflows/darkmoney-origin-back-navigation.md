# DarkMoney Origin Back Navigation Workflow

Usar este workflow cuando se cree, revise o corrija navegación de retroceso en módulos DarkMoney.

## Objetivo

Estandarizar el UX de retroceso para que cada módulo vuelva al origen real desde donde fue abierto, no necesariamente al dashboard.

## Cuándo usar

Usar cuando el usuario pida:

- Crear un nuevo módulo.
- Abrir un módulo desde `Más`.
- Corregir navegación de back.
- Revisar comportamiento de Android back gesture.
- Revisar swipe-back iOS.
- Revisar rutas con `?from=more`.
- Evitar que una pantalla vuelva al dashboard incorrectamente.
- Estandarizar navegación entre módulos.

## Reglas iniciales

- No modifiques archivos al inicio si el usuario pidió análisis o plan.
- Primero identifica desde dónde puede abrirse la pantalla.
- No asumir dashboard como fallback universal.
- Usar `useOriginBackNavigation` si existe.
- No duplicar lógica de back por pantalla.
- No crear un hook nuevo si el hook central puede extenderse.

## Paso 1: Identificar la pantalla

Localiza:

- Archivo de ruta bajo `app/`.
- Header o componente que contiene la flecha de volver.
- Navegación que abre el módulo.
- Parámetros usados en la URL.
- Uso de `router.push`, `router.replace`, `router.back` o helpers equivalentes.
- Uso actual de `useOriginBackNavigation`.

## Paso 2: Identificar orígenes posibles

Listar desde dónde se puede abrir la pantalla:

- `more`.
- `dashboard`.
- `notifications`.
- Otro módulo.
- Deep link.
- Search.
- Modal/sheet.
- Flujo interno.

Si el origen no está explícito, proponer cómo pasarlo.

Ejemplo:

```ts
router.push('/subscriptions?from=more')
```

## Paso 3: Revisar implementación del back

Verificar:

- La flecha del header usa `handleBack` del hook central.
- No hay `router.back()` directo en pantalla origin-aware.
- No hay navegación hardcodeada a dashboard.
- El hook resuelve correctamente `from`.
- Si no hay `from`, se conserva comportamiento normal del stack.

## Paso 4: Verificar Android

En Android, el gesto/botón de retroceso del sistema debe estar cubierto con `BackHandler`.

Buscar en el hook central:

```ts
BackHandler.addEventListener('hardwareBackPress', ...)
```

Reglas:

- Si hay `from`, consumir evento y ejecutar `handleBack()`.
- Retornar `true` cuando el evento fue manejado.
- Retornar `false` si no hay `from`.
- Limpiar listener al desmontar.

## Paso 5: Verificar iOS / React Navigation

Para navegación interceptada por React Navigation, revisar:

```ts
navigation.addListener('beforeRemove', ...)
```

Reglas:

- Si hay `from`, prevenir navegación por defecto.
- Ejecutar `handleBack()`.
- No bloquear navegación normal si no hay origen explícito.
- Limpiar listener al desmontar.

## Paso 6: Revisar nuevos módulos

Cuando se cree un módulo nuevo:

- Si se abre desde `Más`, pasar `?from=more`.
- Usar `useOriginBackNavigation` para back.
- Registrar pantalla oculta en `app/(app)/_layout.tsx` con `href: null` cuando aplique.
- No usar dashboard como destino fijo.
- Probar flecha y gesto Android.

## Paso 7: Validación

Ejecutar:

```bash
npm run typecheck
git diff --check
```

Ejecutar:

```bash
npm run lint
```

solo si existe configuración ESLint válida.

## Prueba manual recomendada

Probar en Android real o emulador:

1. Ir a `Más`.
2. Abrir el módulo.
3. Volver con flecha.
4. Confirmar que vuelve a `Más`.
5. Abrir otra vez el módulo.
6. Volver con gesto/botón del sistema Android.
7. Confirmar que vuelve a `Más`, no a dashboard.

Probar otros orígenes si existen:

- Dashboard.
- Notificaciones.
- Otro módulo.
- Search.

## Findings comunes

Reportar si aparece cualquiera de estos problemas:

- `router.back()` directo en pantalla origin-aware.
- Dashboard hardcodeado.
- `?from=more` faltante.
- `useOriginBackNavigation` no usado.
- `BackHandler` ausente para Android.
- `beforeRemove` usado como única solución para Android.
- Listener sin cleanup.
- Pantalla abierta desde `Más` sin registro oculto en layout.
- Fallback que rompe navegación normal sin `from`.

## Formato de cierre

Responder con:

- Archivos modificados.
- Orígenes soportados.
- Cambios en hook o rutas.
- Si se cubrió flecha del header.
- Si se cubrió Android back gesture/button.
- Si se cubrió iOS swipe/React Navigation.
- Comandos ejecutados y resultado.
- Pruebas manuales pendientes.