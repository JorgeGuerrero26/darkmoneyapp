# Universal Links (iOS) y App Links (Android)

El correo debe seguir usando **HTTPS** con la misma ruta que la web:

`https://TU_DOMINIO/share/obligations/{token}`

## App móvil

1. En `.env` define `EXPO_PUBLIC_UNIVERSAL_LINK_HOST=TU_DOMINIO` (solo hostname, sin `https`).
2. Vuelve a generar proyectos nativos si hace falta: `npx expo prebuild --clean` (o build con EAS).
3. `app.config.js` añade `associatedDomains` (iOS) e `intentFilters` (Android) cuando esa variable está definida.

## Servidor (mismo dominio que la SPA)

Publica:

- `https://TU_DOMINIO/.well-known/apple-app-site-association` (sin extensión, JSON, Content-Type adecuado).
- `https://TU_DOMINIO/.well-known/assetlinks.json`

Incluye el **Team ID** de Apple, el bundle id `com.darkmoney.app` y el package Android `com.darkmoney.app` con el certificado de firma (SHA-256) del keystore de release.

## Comportamiento

- Con la app instalada y el dominio verificado, el enlace abre la pantalla de aceptación en la app.
- Sin app o en escritorio, el navegador sigue cargando la SPA en `/share/obligations/:token`.

## Esquema custom (opcional)

Sigue disponible `darkmoney://` vía `scheme` en Expo para pruebas internas.
