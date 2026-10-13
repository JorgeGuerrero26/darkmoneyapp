# IPA de iPhone sin Mac y sin pagar — guía para agentes de IA

Cómo generar el `.ipa` cuando no hay Mac: **un Mac de GitHub lo compila sin firmar y tú lo firmas e
instalas con Sideloadly desde Windows** (Apple ID gratuito). Sirve para cualquier cambio nativo,
como el motor offline (`expo-sqlite`, versión 1.1.0).

Qué NO cambia: el Apple ID gratuito sigue caducando a los **7 días** (se refirma encima sin
borrar la app) y sigue sin push ni Associated Domains. Ver `docs/REINSTALL_IOS.md`.

El workflow es `.github/workflows/build-ios-ipa.yml`. El repo es **público**, por eso los
minutos de macOS son gratis; si algún día se hace privado cuentan x10 contra la cuota gratuita.

---

## Una sola vez: secretos en GitHub

GitHub → repo → *Settings → Secrets and variables → Actions → New repository secret*:

| Secreto | Valor |
|---|---|
| `EXPO_PUBLIC_SUPABASE_URL` | el mismo del `.env` |
| `EXPO_PUBLIC_SUPABASE_ANON_KEY` | el mismo del `.env` (la clave *anon*; ya viaja dentro de cada APK/IPA) |
| `EXPO_PUBLIC_UNIVERSAL_LINK_HOST` | opcional (por defecto `darkmoney.company`) |

**No** subir `DB_PASSWORD` ni `DATABASE_URL`: el build no los necesita.

## Cada vez que se quiere un IPA

1. Los cambios deben estar en GitHub (`git push`) — el workflow compila lo que hay en `main`.
2. GitHub → *Actions* → **Compilar IPA de iPhone (sin firmar)** → *Run workflow*.
3. Tarda 25-45 min la primera vez. Si falla, abrir el paso rojo y ver "Errores conocidos".
4. Al terminar, bajar el artefacto **DarkMoney-ipa** (zip con `DarkMoney-<versión>.ipa`). Se borra a
   los 3 días.
5. En Windows, abrir **Sideloadly**, arrastrar el `.ipa`, elegir el Apple ID gratuito y *Start*
   (iPhone conectado o emparejado; ver `docs/REINSTALL_IOS.md`, "Cómo se instala ahora").
6. En el iPhone: *Ajustes → General → VPN y gestión de dispositivos → Confiar*.

La app se instala **encima** de la anterior (mismo identificador `com.darkmoney.app`): los datos
locales se conservan. Una excepción posible: si Sideloadly firma con un equipo distinto al anterior,
la sesión guardada en el llavero puede no heredarse y hay que **volver a iniciar sesión**.

## Qué verifica el workflow antes de dar el IPA por bueno

`BUILD SUCCEEDED` no garantiza nada (pasó con `ExpoSpeechRecognition` en el IPA 1.0.8). El paso
*Verificar módulos nativos dentro del binario* falla si `ExpoSQLite`, `ExpoSecureStore`,
`ExpoCamera` o `ExpoSpeechRecognition` no aparecen en el ejecutable, o si falta `main.jsbundle`
(sin el JS embebido la app pediría un servidor de desarrollo).

## Runtimes y OTA

El IPA nuevo trae `version` 1.1.0 → **runtime 1.1.0**. Los arreglos solo-JS futuros se publican con
`npm run ota -- "descripción"` como siempre; `scripts/publish-ota.mjs` los manda al runtime actual
y a los de `LEGACY_RUNTIMES`. Cuando el iPhone ya corra el IPA 1.1.0, **la entrada 1.0.8 de
`LEGACY_RUNTIMES` deja de hacer falta para el iPhone** — pero solo se quita cuando conste que
ningún dispositivo corre ese binario.

## Errores conocidos / qué mirar si falla

> Este workflow **no se ha ejecutado todavía** (se escribió sin Mac, el 2026-10-12). La primera
> corrida puede pedir ajustes; anotarlos aquí.

| Síntoma | Causa probable | Qué hacer |
|---|---|---|
| Falla `Comprobar secretos` | Falta un secreto | Crearlo (arriba) |
| `pod install` falla | Versión de CocoaPods/Xcode del runner | Fijar `xcode-version` en el workflow a una concreta |
| Error de firma (`Signing for "DarkMoney" requires a development team`) | El proyecto generado exige equipo | Añadir `DEVELOPMENT_TEAM=` vacío y `CODE_SIGNING_ALLOWED=NO` ya van; si persiste, añadir `PROVISIONING_PROFILE_SPECIFIER=""` |
| Falla *Verificar módulos nativos* con `ExpoXxx: 0` | Un pod no se enlazó | No instalar ese IPA; revisar `pod install` y el prebuild |
| `main.jsbundle` no existe | Se compiló Debug o falló el empaquetado de JS | Revisar el paso `Compilar` (debe ser `-configuration Release`) |
| Sideloadly rechaza el IPA | Entitlements no vacíos | El paso *Vaciar entitlements* debe correr después del prebuild |
