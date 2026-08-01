# Reinstalar DarkMoney en iPhone — guía para agentes de IA

Cuando el usuario dice **"la app de iPhone ya no abre"**, esta es la receta.

Contexto: el iPhone corre un build **local** firmado con el **Apple ID gratis** del usuario.
Apple caduca ese permiso a los **7 días** → la app deja de abrir. **No se borra y los datos
se conservan**: basta recompilar e instalar encima.

Historial: primera instalación 2026-07-27 (sesión donde se resolvió todo lo de abajo).

---

## ⚠️ LEER PRIMERO — la Mac se formateó (2026-07-30)

**Todo lo que sigue a partir del Paso 1 requiere una Mac y ya no aplica**, salvo que el
usuario consiga otra. Xcode solo existe en macOS: sin Mac no se puede compilar ni firmar
un build nuevo, y el Apple ID gratis solo emite perfiles desde Xcode.

### Qué se dejó preparado antes de formatear

Se exportó un **`.ipa` sin firmar** desde la Mac, en su último día:

| Dato | Valor |
|---|---|
| Archivo | `DarkMoney-1.0.8.ipa` (16 MB) |
| Generado | 2026-07-30, commit `f47940c` |
| Versión / runtime | 1.0.8 — canal de updates `preview` |
| Bundle JS | **embebido** (11 MB): arranca sin Metro ni Mac |
| Firma | **ninguna** (a propósito: AltStore la pone) |

> El usuario debía copiarlo fuera del Escritorio antes del formateo. **Si no aparece,
> no se puede regenerar sin una Mac** — verificarlo antes de prometer nada.

Comando con el que se generó (para repetirlo si algún día hay Mac):

```bash
xcodebuild -workspace ios/DarkMoney.xcworkspace -scheme DarkMoney -configuration Release \
  -destination "generic/platform=iOS" -derivedDataPath /tmp/dm-ipa-build \
  CODE_SIGNING_ALLOWED=NO CODE_SIGNING_REQUIRED=NO CODE_SIGN_IDENTITY=""
# luego: Payload/DarkMoney.app → zip → .ipa
```

Release, no Debug: con Debug el bundle JS no queda embebido y la app necesitaría el
servidor de desarrollo. Sin firmar y con `generic/platform=iOS` **no hace falta el iPhone
conectado**, porque AltStore re-firma todo (incluidos los 3 frameworks embebidos).

### Cómo se instala ahora (Windows, gratis)

**AltStore** (o **SideStore**, que se renueva solo por wifi) firma el `.ipa` con el Apple ID
gratis desde una PC Windows. Requiere **iTunes e iCloud de apple.com**, no las versiones de
Microsoft Store. Instalar AltServer → AltStore en el iPhone → **+** → elegir el `.ipa` →
en el iPhone, *Ajustes › General › VPN y gestión de dispositivos → Confiar*.

Los datos se conservan: mismo bundle ID (`com.darkmoney.app`).

### Qué sigue funcionando y qué no

- ✅ **Los cambios solo-JS siguen llegando** por `eas update --channel preview`: el `.ipa`
  quedó con runtime 1.0.8 y canal `preview`. No hace falta Mac para eso.
- ❌ **Cambios nativos** (Kotlin, permisos, dependencias nativas, bump de `version`) ya no
  llegan al iPhone: exigirían un `.ipa` nuevo → Mac o cuenta de pago.
- ⚠️ Sigue caducando a los **7 días**; AltStore renueva con la PC en la misma red,
  SideStore sin ella.

### La salida definitiva

**Apple Developer Program ($99/año)**: EAS compila iOS en la nube y se instala por
TestFlight desde Windows, sin Mac nunca más y con 90 días de vigencia. Requiere agregar
perfil `ios` a `eas.json` (hoy solo tiene Android). Ofrecido al usuario el 2026-07-30;
no lo tomó en ese momento.

---

## Regla #0: `BUILD SUCCEEDED` no significa instalada

Son dos pasos separados y el segundo falla distinto:

1. `xcodebuild` compila y **firma** → puede fallar por llavero bloqueado.
2. `devicectl` **instala** → puede fallar por cable, Developer Mode o DDI.

**NO usar `npx expo run:ios`.** Compila bien pero su instalador está roto con iOS/macOS
nuevos: revienta con `TypeError: Cannot convert object to primitive value` en
`LockdowndClient.startSession`. Avisa antes con
`Unexpected devicectl JSON version output from devicectl`. Se compila con `xcodebuild` y se
instala con `devicectl`.

---

## Datos fijos del entorno

| Dato | Valor |
|---|---|
| UDID del iPhone (`--device`) | `00008140-000631041490801C` |
| Identificador CoreDevice | `3062CF18-4379-555D-A8F0-F81B30EC836F` |
| Nombre del dispositivo | `iPhone de Jorge` (iPhone 16 Pro Max, iPhone17,2) |
| Bundle ID | `com.darkmoney.app` |
| Team de firma | `NWZGL477PZ` — **Jorge Guerrero (Personal Team)** |
| Workspace | `ios/DarkMoney.xcworkspace`, scheme `DarkMoney` |

**Team: NUNCA usar otro.** En esta Mac también están registrados
`9TJPNZU45G` (Agrovision Peru S.A.C., empresa) y `6B28RS5FXF` (Antony Joel Sanchez
Sandoval, otra persona). Firmar la app personal con el equipo corporativo la deja a
nombre de la empresa.

`node` y `adb` **no están en el PATH** por defecto. Exportar siempre:

```bash
export PATH="/opt/homebrew/bin:/Users/clinaresb/Library/Android/sdk/platform-tools:$PATH"
export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8   # CocoaPods revienta sin UTF-8
```

---

## Paso 1 — Pedirle al usuario (no se puede automatizar)

- **Conectar el iPhone con cable USB-C de datos** (no de solo carga).
- **Desbloquear** el iPhone y dejarlo despierto durante todo el proceso.
- Aceptar **"¿Confiar en este ordenador?"** si aparece.
- **Dejar el Mac desbloqueado** (si se bloquea, el llavero se cierra y la firma falla).

> El cable es obligatorio: el Developer Disk Image (DDI) **no se monta por Wi-Fi**.
> Si el teléfono está solo emparejado por red, `devicectl` lo ve pero la instalación falla.

---

## Paso 2 — Validar el dispositivo (NO OPCIONAL)

```bash
# a) ¿lo ve devicectl? Estado esperado: "connected" o "available (paired)"
xcrun devicectl list devices | grep -i "iphone de jorge"

# b) ¿está por USB de verdad? (system_profiler NO lo muestra; usar ioreg)
ioreg -p IOUSB -l -w 0 | grep -iE "iPhone|SupportsIPhoneOS" | head -3

# c) prueba REAL de DDI: si esto lista procesos, el dispositivo está listo
xcrun devicectl device info processes --device 00008140-000631041490801C | head -5
```

Salida buena de (c):

```
Acquired tunnel connection to device.
Enabling developer disk image services.
Acquired usage assertion.
PID   Executable Path
1     /sbin/launchd
```

Si (b) no muestra nada → **no hay cable**, volver al Paso 1.

---

## Paso 3 — Validar que el proyecto iOS sigue parcheado (CRÍTICO)

`ios/` está **gitignored** y es generado. Si alguien corrió `expo prebuild`, se
**revierten** los dos parches que hacen posible la firma gratis:

```bash
cd /Users/clinaresb/Desktop/Proyectos/darkmoneyapp

# 1) entitlements deben estar VACÍOS: <dict/>
cat ios/DarkMoney/DarkMoney.entitlements

# 2) el team debe estar puesto (esperado: 2)
grep -c "DEVELOPMENT_TEAM = NWZGL477PZ" ios/DarkMoney.xcodeproj/project.pbxproj
```

### Si los entitlements NO están vacíos

Los Apple ID gratis **no soportan Push Notifications ni Associated Domains**. Con ellos
presentes, Xcode responde:
`Cannot create a iOS App Development provisioning profile ... Personal development teams
do not support the Associated Domains and Push Notifications capabilities`.

Vaciarlos:

```bash
cat > ios/DarkMoney/DarkMoney.entitlements <<'EOF'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
  <dict/>
</plist>
EOF
```

### Si falta el proyecto iOS completo

Solo entonces regenerar, y **volver a aplicar los dos parches**:

```bash
npx expo prebuild --platform ios
cd ios && pod install && cd ..     # requiere LANG/LC_ALL en UTF-8
# → vaciar entitlements (arriba)
# → abrir Xcode y elegir Team "Jorge Guerrero (Personal Team)" en
#   TARGETS > DarkMoney > Signing & Capabilities  (o setear DEVELOPMENT_TEAM=NWZGL477PZ)
open ios/DarkMoney.xcworkspace
```

---

## Paso 4 — Compilar (Release, no Debug)

**Release** para que el bundle JS quede embebido y la app funcione **sola**, sin Metro ni
la Mac. Con Debug necesitaría el servidor de desarrollo corriendo: inservible.

```bash
cd /Users/clinaresb/Desktop/Proyectos/darkmoneyapp
xcodebuild -workspace ios/DarkMoney.xcworkspace -scheme DarkMoney -configuration Release \
  -destination "id=00008140-000631041490801C" -allowProvisioningUpdates build 2>&1 | tail -15
```

Lanzar en background: la primera vez tarda 5-15 min; incremental, 1-3 min.

**Validar** (no confiar en el exit code, que viene del pipe):

```bash
grep -c "BUILD SUCCEEDED" <salida>   # esperado: 1
grep -cE "BUILD FAILED|errSecInternalComponent" <salida>   # esperado: 0
```

---

## Paso 5 — Instalar y lanzar

```bash
# ruta del .app (derivada, el hash de DerivedData cambia)
APP=$(find ~/Library/Developer/Xcode/DerivedData -type d \
  -path "*DarkMoney-*/Build/Products/Release-iphoneos/DarkMoney.app" -maxdepth 5 | head -1)
echo "$APP"

xcrun devicectl device install app --device 00008140-000631041490801C "$APP"
xcrun devicectl device process launch --device 00008140-000631041490801C com.darkmoney.app
```

Salida buena:

```
App installed:
• bundleID: com.darkmoney.app
...
Launched application with com.darkmoney.app bundle identifier.
```

### Verificar que quedó viva (no crasheó al arrancar)

```bash
xcrun devicectl device info processes --device 00008140-000631041490801C | grep -i darkmoney
```

Debe devolver una línea con PID y la ruta del bundle. Si no aparece, crasheó: leer logs con
`xcrun devicectl device process launch --console --device <UDID> com.darkmoney.app`.

---

## Paso 6 — Confiar en el certificado (solo si el launch falla por seguridad)

Error esperado con certificado nuevo:

```
Unable to launch com.darkmoney.app because it has an invalid code signature,
inadequate entitlements or its profile has not been explicitly trusted by the user.
```

Pedir al usuario, **en el iPhone**:

**Ajustes › General › VPN y gestión de dispositivos › Apple Development:
joradrianmori@gmail.com › Confiar**

Luego repetir el `process launch`.

---

## Tabla de errores conocidos

| Error | Causa real | Solución |
|---|---|---|
| `The developer disk image could not be mounted` (CoreDeviceError 12040) | iPhone conectado **solo por Wi-Fi** | Conectar cable USB-C de datos |
| `Developer Mode disabled` | Modo desarrollador apagado | iPhone: Ajustes › Privacidad y seguridad › **Modo de desarrollador** → activar → reiniciar |
| `iOS <X> is not installed. Please download and install the platform` | Falta el componente de plataforma de esa versión de iOS | Xcode › Settings › **Components** → descargar iOS `<X>`, o el botón **Get** de la barra. `xcodebuild -downloadPlatform iOS` sirve pero necesita permisos de admin y no siempre trae el de dispositivo |
| SDK de Xcode < iOS del teléfono | Xcode viejo (pasó con Xcode 26.2 vs iPhone en iOS 26.5) | Actualizar Xcode. Validar con `xcodebuild -showsdks` vs `xcrun devicectl device info details --device <UDID> \| grep osVersionNumber` |
| `errSecInternalComponent` al firmar | **Llavero del Mac bloqueado** (pantalla bloqueada a mitad del build) | Desbloquear el Mac / dar permiso de administrador y reintentar. En Llavero, permitir "siempre" el uso de la clave `Apple Development` |
| `Cannot create a iOS App Development provisioning profile` | Entitlements con Push/Associated Domains | Vaciar entitlements (Paso 3) |
| `TypeError: Cannot convert object to primitive value` en `LockdowndClient` | Instalador de `expo run:ios` roto | Usar `xcodebuild` + `devicectl` (Regla #0) |
| `Unicode Normalization not appropriate for ASCII-8BIT` en `pod install` | Locale no UTF-8 | `export LANG=en_US.UTF-8 LC_ALL=en_US.UTF-8` |

---

## Qué SÍ y qué NO llega por OTA

El build de iOS tiene `expo-updates` activo (`EXUpdatesEnabled: true`,
`CheckOnLaunch: ALWAYS`, canal `preview`, runtimeVersion = `version` de app.json). O sea:

- **Cambios solo de JS/TS** → van por OTA y llegan al iPhone **y** al Android con un solo
  `npx eas-cli update --channel preview -m "..."`. **No hace falta recompilar.**
- **Cambios nativos, iconos, permisos, deps nativas** → requieren repetir Pasos 4-5.
- Si se bumpea `version` en app.json, cambia el runtimeVersion y el build viejo de iOS
  **deja de recibir OTAs** hasta reinstalarlo.

---

## Límites del Apple ID gratis (por qué caduca)

- El perfil dura **7 días**; luego la app no abre (datos intactos).
- Sin **push notifications** (el digest diario no llega en iOS).
- Sin **Associated Domains** (universal links de `darkmoney.company`; el esquema
  `darkmoney://` sí funciona).
- Máximo 3 apps instaladas así.
- **No se le puede pasar a otra persona.**

Con **Apple Developer Program ($99/año)** desaparece todo esto: perfiles de 1 año,
TestFlight (instalación por invitación, sin cable), push, y builds en la nube con EAS sin
depender de la versión local de Xcode.

---

## Recordatorio: en iPhone no hay detección de notificaciones

`NotificationListenerService` es exclusivo de Android; iOS **no** permite a una app leer
notificaciones de otras apps. En iPhone DarkMoney no captura Yape/banco automáticamente.
La vía prevista para iOS es leer los **correos de recibos con la API de Gmail**.
