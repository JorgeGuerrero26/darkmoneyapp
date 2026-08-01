# Modo privacidad (ocultar montos) — Diseño

**Fecha:** 2026-07-13 · **Estado:** aprobado (enfoque A)

## Problema

Compartiendo pantalla (o con alguien mirando) la app expone patrimonio, saldos y montos. Los bancos resuelven esto con un toggle de ojo que enmascara todo. Se pidió para dashboard simple y avanzado; decisión validada: cubre **toda la app** (montos + gráficos), toggle en el header del dashboard, **persistente** entre arranques.

## Arquitectura del enmascarado

La vía de render de montos tiene un cuello perfecto:

- `lib/format-currency.ts` — formateador **puro/RN-free** (lo consumen selectors, builders y tests node). NO debe importar el store.
- `components/ui/AmountDisplay.tsx` — re-exporta `formatCurrency`; **81 archivos de UI** importan desde aquí. La máscara vive en este re-export.
- Única excepción UI: `features/dashboard/lib/advanced-builders.ts` importa el puro directamente (sus tests corren en node sin RN) — el dashboard avanzado se cubre a nivel de sección (ver Gráficos).

### Piezas

1. **Estado** (`store/ui-store.ts`): `privacyMode: boolean` (default `false`) + `togglePrivacyMode()`. Agregar `privacyMode` al `partialize` del persist (línea ~98) para que sobreviva reinicios.
2. **Máscara pura** (`lib/format-currency.ts`): `maskedCurrencyLabel(currencyCode): string` → símbolo + puntos: `"S/ ••••"` para PEN, `"$ ••••"`/`"US$ ••••"` según Intl (derivar el símbolo formateando 0 y reemplazando dígitos/separadores por `••••`). Pura y testeada en jest.
3. **Interceptor RN** (`components/ui/AmountDisplay.tsx`): el re-export deja de ser alias directo:

   ```ts
   export function formatCurrency(amount: number, currencyCode: string): string {
     if (useUiStore.getState().privacyMode) return maskedCurrencyLabel(currencyCode);
     return formatCurrencyPure(amount, currencyCode);
   }
   ```

   El componente `AmountDisplay` usa esta versión. Los 81 consumidores quedan cubiertos sin tocarlos. Los inputs de formularios NO pasan por aquí (siguen visibles al editar — correcto).
4. **Toggle UI**: icono `Eye`/`EyeOff` en `DashboardHeaderRight` (dashboard.tsx línea ~710; el componente se comparte entre simple y avanzado). Haptic ligero + `accessibilityLabel` ("Ocultar montos"/"Mostrar montos").
5. **Reactividad**: la lectura imperativa (`getState`) no re-renderiza por sí sola. Suscripción `const privacyMode = useUiStore((s) => s.privacyMode);` en las pantallas con dinero para forzar el re-render top-down al toggle:
   - Tabs/listas: dashboard, movements, accounts, obligations, subscriptions, recurring-income, budgets, more (si muestra totales).
   - Detalles: movement, account, obligation, subscription, budget, recurring-income.
   - **Audit `React.memo`**: el plan enumera (grep) los componentes memoizados que muestran montos; a cada uno se le pasa `privacyMode` como prop (o se suscribe él mismo) para invalidar su memo. Sin esto, muestran el valor viejo hasta otro re-render — es el riesgo principal del enfoque.
6. **Gráficos** (revelan magnitudes): `MiniBarChart`, `RingChart`, `SparkLine` y las secciones del dashboard avanzado con cifras/curvas. Con `privacyMode` activo renderizan un placeholder plano de su mismo tamaño con texto "Oculto por privacidad" (tokens del theme, sin nueva paleta). El dashboard avanzado reemplaza todo su contenido analítico por una card de privacidad (es íntegramente cifras) (sus builders puros no se tocan).

## Criterios de aceptación

1. Tap al ojo en el dashboard (simple o avanzado) → todos los montos visibles pasan a `S/ ••••` al instante, incluido el hero de patrimonio; los gráficos muestran su placeholder.
2. Con el modo activo, navegar a Movimientos/Cuentas/detalles muestra todo enmascarado (también las pantallas que ya estaban montadas en tabs).
3. Matar y reabrir la app conserva el estado del toggle.
4. Desactivar restaura todo al instante, sin refetch (es solo presentación).
5. Formularios y edición de montos siguen funcionando normal (inputs visibles).
6. Tests: jest para `maskedCurrencyLabel` (PEN/USD/código inválido); los tests node existentes de builders siguen verdes (el puro no cambió de firma).

## Fuera de alcance

- Biométrico para revelar (se puede montar encima después).
- Bloquear exports/CSV/compartir (acción deliberada del usuario).
- Enmascarar notificaciones push del sistema (las genera el backend).
