# Marca e íconos de DarkMoney

Una sola marca: **la billetera blanca con la tarjeta verde, sombra suave, sobre gris oscuro**.
La referencia es `icon-billetera.png` (1024×1024). Todo lo demás sale de ella; no hay otra versión del logo
(la calavera y el logo plano anteriores se eliminaron en la 1.3.0).

## Qué archivo se usa dónde

| Archivo | Dónde aparece | Configurado en |
|---|---|---|
| `icon-billetera.png` | Ícono de iOS, ícono legado de Android (< 8.0), favicon web | `app.json` → `expo.icon`, `ios.icon`, `web.favicon` |
| `icon-billetera-adaptive.png` | Primer plano del ícono adaptativo de Android (1024, transparente) | `android.adaptiveIcon.foregroundImage` |
| `icon-billetera-adaptive-bg.png` | Fondo del ícono adaptativo (el degradado gris de la referencia) | `android.adaptiveIcon.backgroundImage` (+ `backgroundColor #1D1E23` de respaldo) |
| `icon-billetera-monochrome.png` | Íconos temáticos de Android 13+ (silueta; la tarjeta al 55 %) | `android.adaptiveIcon.monochromeImage` |
| `notification-icon.png` | Ícono pequeño de las notificaciones de Android (96×96, blanco) | plugin `expo-notifications` → `icon` (+ `color #86CE96`) |
| `logo-billetera.png` | Pantalla de carga nativa, pantalla de carga JS, login, avisos (Toast) | plugin `expo-splash-screen` → `image`; `app/_layout.tsx`, `app/(auth)/login.tsx`, `components/ui/Toast.tsx` |
| `plugins/notification-detection/drawable/logo_darkmoney.png` | Encabezado de la ventana rápida de movimientos (Android) | lo copia el plugin a `res/drawable/` |
| `supabase/functions/invite-banner/banner-darkmoney.jpeg` | Imagen del correo de invitación | edge function `invite-banner`: tras cambiarla, `node scripts/brand/embed-invite-banner.mjs` y desplegarla |

Las notificaciones nativas de Kotlin (`DarkMoneyNotificationListenerService.kt`, `NotificationDetectionModule.kt`) usan
`R.drawable.notification_icon`, el mismo que genera `expo-notifications`. No usar `R.mipmap.ic_launcher*` como ícono
pequeño: Android lo pinta como silueta y se ve un cuadrado.

## Ícono adaptativo de Android: área segura

El lienzo es de 108 dp (1024 px); el lanzador muestra 72 dp y recorta con su máscara (círculo, squircle, gota…).
Lo que debe verse completo tiene que caber en el **círculo central de 66 dp** (radio ≈ 0,306 del lienzo).
La billetera ocupa 471 px de ancho y su semidiagonal es 0,281 del lienzo: entra en cualquier máscara sin cortarse.
`generate_all.py` falla si una regeneración la saca de esa zona.

## Regenerar las variantes

Si cambia la referencia, regenerar todo con los scripts de `scripts/brand/` (Python 3 + Pillow):

```bash
python -I scripts/brand/extract_logo.py assets/images/icon-billetera.png <tmp>/logo_raw.png
python -I scripts/brand/generate_all.py assets/images/icon-billetera.png <tmp>/logo_raw.png <tmp>/out \
  node_modules/@expo-google-fonts/archivo/600SemiBold/Archivo_600SemiBold.ttf
python -I scripts/brand/verify_sheet.py <tmp>/out assets/images/icon-billetera.png   # deja <tmp>/verificacion.png
```

Revisar `verificacion.png` (máscaras, tamaños de 18–60 px, fondos claro y oscuro) y copiar las salidas a su sitio
(tabla de arriba; `logo_darkmoney.png` al plugin, `banner-darkmoney.jpeg` a la edge function, seguido de `node scripts/brand/embed-invite-banner.mjs`).

## Llevarlo al teléfono

- Ícono, ícono adaptativo, pantalla de carga nativa y notificaciones son **nativos**: necesitan APK/IPA nuevos
  (subir `version` y `versionCode` en `app.json` y `npm run build:android`). Una OTA no los cambia.
- El logo dentro de la app (login, carga JS, avisos) sí llega por OTA.
- `android/` e `ios/` no están en git: EAS los regenera desde `app.json` y los plugins. Para ver el resultado en
  local sin tocar cambios nativos existentes, correr `npx expo prebuild --platform android --no-install` en un
  worktree limpio. **No usar `prebuild --clean` en la carpeta principal** sin revisar antes `android/`: lo borra entero.
