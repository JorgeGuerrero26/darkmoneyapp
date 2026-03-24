# Iconos de la app

- **`app-icon.png`** — 1024×1024. Lo usa Expo para **icono general** (iOS, `expo.icon`), favicon web y splash.
- **`app-icon-playstore.png`** — Usado como **primer plano del icono adaptativo de Android** (`android.adaptiveIcon.foregroundImage` en `app.json`). Suele llevar más margen que el de App Store; si aún se ve “con zoom” o cortado, el PNG necesita **más padding** (ver abajo).

Para regenerar recursos nativos tras cambiar cualquier PNG:

```bash
npx expo prebuild --clean
```

Luego vuelve a compilar el APK/AAB o `eas build`.

## Por qué en el celular parece “zoom” (Android)

Los launchers usan **icono adaptativo**: el sistema escala el `foregroundImage` y lo enmascara (círculo / squircle). Todo lo que está **muy pegado al borde** del PNG se recorta o parece ampliado.

**Recomendación de Google:** en un lienzo tipo **108×108 dp** (equivalente a exportar ~1024×1024), mantén lo importante dentro del **círculo central ~66 dp** (aprox. **62% del ancho** del cuadrado como guía). En la práctica: deja **bastante margen transparente** alrededor del cráneo / anillo; si el dibujo llena el cuadrado entero, seguirá viéndose “zoom”.

- Ajusta el arte en Figma/Photoshop y vuelve a exportar `app-icon-playstore.png`.
- El `backgroundColor` del adaptativo (`#05070B` en `app.json`) rellena lo que no cubre el PNG transparente.
