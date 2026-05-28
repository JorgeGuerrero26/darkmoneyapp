# Build APK — guía para agentes de IA

Cómo generar el APK release de DarkMoney de forma limpia y verificar que los cambios Kotlin **realmente entraron**. Pensado para Windows + PowerShell (entorno principal del repo); las notas para macOS/Linux van al final.

> Si tu cambio toca el sistema de detección de notificaciones, lee primero la skill `darkmoney-notification-detection` — esta guía complementa, no reemplaza.

---

## Regla #0: `BUILD SUCCESSFUL` no garantiza nada

Gradle cachea agresivamente. Es **muy fácil** que el APK final no contenga tu edición Kotlin aunque el build termine en verde. Síntomas típicos: instalas el APK, abres la app, y el bug que arreglaste sigue ahí.

Siempre haz los **3 pasos**:

1. Sincronizar `plugins/` → `android/app/src/main/java/`
2. Limpiar caches Gradle/Kotlin/DEX
3. Build + **verificación DEX**

Saltarte cualquiera de los 3 pierde tiempo del usuario.

---

## Paso 1 — Sincronizar copias Kotlin (REGLA CRÍTICA)

Los `.kt` del plugin nativo viven en **dos rutas**. Gradle compila desde `android/`, NO desde `plugins/`:

| Editable | Compilado |
|---|---|
| `plugins/notification-detection/native-src/notificationdetection/*.kt` | `android/app/src/main/java/com/darkmoney/app/notificationdetection/*.kt` |

Después de editar cualquier `.kt` en `plugins/`, copia al `android/` espejo:

```powershell
Copy-Item plugins\notification-detection\native-src\notificationdetection\NombreArchivo.kt `
          android\app\src\main\java\com\darkmoney\app\notificationdetection\NombreArchivo.kt -Force
```

**Verifica los hashes** (no asumas que copiaste todo lo que editaste):

```powershell
$files = 'DarkMoneyNotificationListenerService','QuickMovementOverlay','NotificationDetectionModule','NotificationDetectionStore','QuickMovementDialogActivity','NotificationDetectionActionReceiver','NotificationDetectionSaveTaskService'
foreach ($f in $files) {
  $a = Get-FileHash "plugins\notification-detection\native-src\notificationdetection\$f.kt" -Algorithm MD5
  $b = Get-FileHash "android\app\src\main\java\com\darkmoney\app\notificationdetection\$f.kt" -Algorithm MD5
  if ($a.Hash -eq $b.Hash) { "$f`: OK" } else { "$f`: OUT OF SYNC" }
}
```

Todos deben decir `OK`. Si alguno dice `OUT OF SYNC`, copialo y repite.

---

## Paso 2 — Limpiar caches

Borra los tres caches que retienen `.class` viejos:

```powershell
Remove-Item -Recurse -Force android\.gradle, `
                            android\app\build\tmp\kotlin-classes, `
                            android\app\build\intermediates\dex `
                            -ErrorAction SilentlyContinue
```

No es necesario hacer un `./gradlew clean` completo (más lento, sin beneficio extra para este caso).

---

## Paso 3 — Build release

### Variables de entorno (Windows)

PowerShell **no las hereda** entre comandos del agente; setéalas en el mismo statement que `gradlew.bat`:

```powershell
$env:JAVA_HOME = "C:\Program Files\Android\Android Studio\jbr"
$env:ANDROID_HOME = "$env:LOCALAPPDATA\Android\Sdk"
$env:ANDROID_SDK_ROOT = "$env:LOCALAPPDATA\Android\Sdk"
$env:PATH = "$env:JAVA_HOME\bin;$env:PATH"
```

> **Por qué `Android Studio\jbr`**: Android Studio trae su propio JDK embebido (JetBrains Runtime). Es el JDK probado contra Gradle 8.14.3. Si la máquina tuviera un JDK del sistema en otra ruta, ajustar.

### Comando

```powershell
Push-Location android
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
$exit = $LASTEXITCODE
Pop-Location
"EXITCODE=$exit"
```

**Crítico — el argumento `-P` DEBE ir entre comillas dobles.** PowerShell parsea la coma como separador de array y rompe el build con:

```
Falta un argumento en la lista de parámetros. (MissingArgument)
```

Forma incorrecta (falla con exit 1):
```powershell
.\gradlew.bat assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

Forma correcta (con quotes):
```powershell
.\gradlew.bat assembleRelease "-PreactNativeArchitectures=arm64-v8a,armeabi-v7a"
```

### Tiempo y comportamiento esperado

- Clean build: ~3-5 min en una máquina decente.
- Si te importa la velocidad y solo necesitas arm64, puedes omitir `armeabi-v7a`: `"-PreactNativeArchitectures=arm64-v8a"`. Tiempo ~2-3 min.
- Si el build supera 10 min, algo está mal — probablemente Gradle está descargando dependencias (primera vez) o hay un test bloqueante.

### Background recomendado

Para builds que pueden tardar varios minutos, usar el flag `run_in_background: true` del tool Bash/PowerShell. El agente recibirá notificación cuando termine sin bloquear el contexto.

---

## Paso 4 — Verificación del APK (NO OPCIONAL)

Ubicación del APK:

```
android\app\build\outputs\apk\release\app-release.apk
```

### Verificar que tus strings entraron al DEX

Extrae los `classes*.dex` y busca marcadores únicos de tu cambio. **Importante**: los comentarios Kotlin (`//`, `/** */`) **NO** se compilan al bytecode. Busca:

- String literals nuevos (mensajes UI, claves de SharedPreferences, etc.)
- Nombres de métodos/clases nuevos
- Constantes bumpeadas (ej. `NOTIF_CLEANUP_KEY = "2026-05-27-v1"`)

```powershell
$tmp = "$env:TEMP\dm_apk_verify"
if (Test-Path $tmp) { Remove-Item -Recurse -Force $tmp }
New-Item -ItemType Directory -Path $tmp | Out-Null

Add-Type -AssemblyName System.IO.Compression.FileSystem
$zip = [System.IO.Compression.ZipFile]::OpenRead("android\app\build\outputs\apk\release\app-release.apk")
$zip.Entries | Where-Object { $_.FullName -like "classes*.dex" } | ForEach-Object {
  [System.IO.Compression.ZipFileExtensions]::ExtractToFile($_, (Join-Path $tmp $_.FullName), $true)
}
$zip.Dispose()

# Buscar marcadores en cualquiera de los DEX
$needles = @("TU_STRING_NUEVO","NombreDelMetodoNuevo","2026-05-27-v1")
foreach ($dex in Get-ChildItem "$tmp\classes*.dex") {
  $bytes = [System.IO.File]::ReadAllBytes($dex.FullName)
  $text = [System.Text.Encoding]::ASCII.GetString($bytes)
  foreach ($needle in $needles) {
    if ($text.Contains($needle)) { "$($dex.Name): FOUND '$needle'" }
  }
}

Remove-Item -Recurse -Force $tmp
```

Si tu marcador **no aparece**, NO instales el APK. Vuelve al Paso 1 (probablemente olvidaste sincronizar al espejo `android/`) o al Paso 2 (caches no limpiadas).

---

## Paso 5 — Instalar y probar

```powershell
adb devices
adb -s <DEVICE_ID> install -r android\app\build\outputs\apk\release\app-release.apk
```

### Diagnóstico post-instalación

`Log.d` está **filtrado en release builds** en Samsung/Android 12+. No esperes ver logs propios en `logcat` salvo que uses `Log.w` / `Log.e` o instrumentes a propósito. Para diagnóstico real:

```powershell
adb -s <DEVICE_ID> shell dumpsys notification --noredact | Select-String -Context 0,20 darkmoney
adb -s <DEVICE_ID> logcat -d 2>&1 | Select-String "NotificationManager.*darkmoney"
```

---

## Anti-patrones que se ven seguido (no hagas esto)

- ❌ Editar solo en `plugins/` y dar el build por hecho. Gradle compila de `android/`. Tu cambio NO entró.
- ❌ Saltarse la verificación DEX porque "el build pasó". El cache de Gradle es muy bueno escondiendo edits sin compilar.
- ❌ `./gradlew clean` antes de cada build. Es **lento** y normalmente innecesario — basta con borrar los 3 directorios del Paso 2.
- ❌ Reportar al usuario "APK listo para probar" sin haber verificado que tu marcador está en el DEX.
- ❌ Asumir que `JAVA_HOME` o `ANDROID_HOME` están seteados. En PowerShell + sesión de Claude Code, casi nunca lo están.
- ❌ Pasar el `-P` sin quotes en PowerShell. Falla silenciosamente con `MissingArgument`.

---

## Cuándo offrecer al usuario "generar el APK"

- Cambios solo TypeScript / JS / config: **no** rebuild — Metro hace HMR. Sugiere `npx expo start` si el usuario quiere probar.
- Cambios en `plugins/notification-detection/native-src/**/*.kt` o en `android/app/src/**`: **sí**, rebuild release.
- Cambios en `android/build.gradle`, `android/app/build.gradle`, `android/gradle.properties`: **sí**, rebuild — además ofrecer `./gradlew clean` si el cambio toca plugins o repositorios.

Antes de generar el APK, confirma con el usuario que quiere correrlo (puede tardar varios minutos). El plan o tu mensaje final puede incluir "¿Genero el APK ahora?".

---

## macOS / Linux (rápido)

Mismas reglas; sintaxis distinta. La skill `darkmoney-notification-detection` ya cubre macOS — referencia ese SKILL.md para `cp`, `unzip`, `strings`. El equivalente PowerShell de `strings <dex> | grep ...` es el bloque de `[System.Text.Encoding]::ASCII.GetString(...)` mostrado arriba.

```bash
JAVA_HOME=$(/usr/libexec/java_home -v 17) \
ANDROID_HOME=~/Library/Android/sdk ANDROID_SDK_ROOT=~/Library/Android/sdk \
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a
```

(macOS/Linux no necesitan quotear el `-P` — solo PowerShell lo rompe.)
