---
name: darkmoney-notification-detection
description: Debug, extend, or fix the Android notification detection system in DarkMoney — covers Kotlin native service, SharedPreferences store, Gradle build pipeline, ADB debugging, and RN/TypeScript sync layer.
---

# DarkMoney Notification Detection

Use this skill when working on notification detection bugs, new app/bank support, detection accuracy, overlay UI, duplicate notifications, or build issues in the native Kotlin plugin.

---

## Architecture overview

```
Gmail / Yape / BCP app
        │ onNotificationPosted / processActiveNotifications
        ▼
DarkMoneyNotificationListenerService.kt   ← detection logic
        │ upsertSuggestion → SharedPreferences
        │ showDetectedMovementNotification → NotificationManager.notify()
        ▼
Android notification tray
  [Registro rápido] → QuickMovementDialogActivity → QuickMovementOverlay
  [Descartar]       → NotificationDetectionActionReceiver
  [tap body]        → deep-link darkmoney://detected-suggestion/<id> → MainActivity

        │ HeadlessTask (via NotificationDetectionSaveTaskService)
        ▼
notification-detection-headless.ts   ← save movement from overlay
        │
        ▼
Supabase: notification_detected_movement_suggestions + movements

        │ useNotificationDetectionRuntimeSync (React hook)
        ▼
syncNativeDetectedSuggestion → Supabase notification record
AI enrichment (category, counterparty, recurring, risk, budget)
```

---

## CRITICAL: dual file locations

Kotlin source exists in **two places**. Gradle compiles from `android/`, not from `plugins/`.

| Editable source | Gradle compiles from |
|---|---|
| `plugins/notification-detection/native-src/notificationdetection/*.kt` | `android/app/src/main/java/com/darkmoney/app/notificationdetection/*.kt` |

**Rule**: after editing any `.kt` file in `plugins/`, always sync it to the corresponding `android/` path:

```bash
cp plugins/notification-detection/native-src/notificationdetection/Foo.kt \
   android/app/src/main/java/com/darkmoney/app/notificationdetection/Foo.kt
```

To check all are in sync:
```bash
for f in DarkMoneyNotificationListenerService NotificationDetectionModule NotificationDetectionStore QuickMovementOverlay QuickMovementDialogActivity NotificationDetectionActionReceiver NotificationDetectionSaveTaskService; do
  diff -q plugins/notification-detection/native-src/notificationdetection/${f}.kt \
          android/app/src/main/java/com/darkmoney/app/notificationdetection/${f}.kt \
    && echo "$f: OK" || echo "$f: OUT OF SYNC"
done
```

---

## Build pipeline

```bash
# Standard incremental build (arm64 + armv7 only, faster)
cd android
ANDROID_HOME=~/Library/Android/sdk ANDROID_SDK_ROOT=~/Library/Android/sdk \
  ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a

# Force recompile when Gradle cache is stale (happens after editing Kotlin)
rm -rf android/.gradle \
       android/app/build/tmp/kotlin-classes \
       android/app/build/intermediates/dex
# then run assembleRelease again

# Verify the APK actually contains your strings before installing
cd /tmp && unzip -o .../app-release.apk 'classes*.dex' -d apk_extracted
strings apk_extracted/classes*.dex | grep "Registro rápido"
strings apk_extracted/classes*.dex | grep "2026-05-16-v1"

# Install
adb -s <DEVICE_ID> install -r .../app-release.apk
```

**Never** rely on "BUILD SUCCESSFUL" alone — always verify strings in the DEX if behavior is unexpected.

---

## ADB debugging

`Log.d` is **filtered** on release builds on Samsung/Android 12+ devices. It will not appear in logcat.

```bash
# Get device ID
adb devices

# Read system-level notification logs (works on release)
adb -s <ID> logcat -d 2>&1 | grep -i "NotificationManager.*darkmoney\|notify("

# Dump all active notifications (channel, ID, content)
adb -s <ID> shell dumpsys notification --noredact | grep -A20 "darkmoney"

# Get app PID and filter all app logs
adb -s <ID> shell pidof com.darkmoney.app
adb -s <ID> logcat -d --pid=<PID> 2>&1 | tail -50
```

---

## Detection logic (DarkMoneyNotificationListenerService.kt)

### Key methods

| Method | Purpose |
|---|---|
| `inferMovementDetection(combined)` | Returns `DetectionResult(movementType, confidence)`. `low` → skip. |
| `isPromotionalNotification(combined)` | Early-exit on transactional signals; blocks promos. |
| `isFinancialGmailNotification(combined)` | Gate for Gmail: must contain financial bank label + amount + transaction signal. |
| `hasFinancialEmailTransactionSignal(combined)` | Sub-gate: confirms email has a real transaction phrase. |
| `extractFinancialEmailMerchant(value)` | Regex `\ben\s+...` — only search `.take(400)` of combined to avoid BCP disclaimer at bottom. |
| `buildSuggestionDescription(...)` | For Gmail + `movementType == "transfer"`: return `"Transferencia $bankLabel"` — do NOT call merchant extractor. |
| `extractAmount(combined)` | Required — if null, suggestion is skipped. |
| `cancelStalePendingNotifications()` | Called from `onListenerConnected`. Cancels movement_detection notifications + removes pending suggestions from store. |

### Transfer detection

Detected in `inferMovementDetection`:
```kotlin
val transferSignals = listOf(
  "transferencia entre mis cuentas",
  "transferencia entre tus cuentas",
  "constancia de transferencia",
)
val isOwnTransfer = transferSignals.any { normalized.contains(it) } ||
  (normalized.contains("realizaste una transferencia") &&
    (normalized.contains("entre mis cuentas") || normalized.contains("desde tu")))
```

Transfer descriptions avoid merchant extraction:
```kotlin
if (movementType == "transfer") {
  return if (!bankLabel.isNullOrBlank()) "Transferencia $bankLabel" else "Transferencia BCP"
}
```

### Yape email signals

- `hasFinancialEmailTransactionSignal`: includes `"monto de yapeo"`, `"pago exitoso"`
- `isFinancialGmailNotification`: Yape branch matches `"pago exitoso"`, `"fue exitoso"`, `"monto de yapeo"`, `"yapear"`, `"yapaste"`, `"yapeo"`
- `isPromotionalNotification` transactionalSignals: includes `"yapeo aprobado"`, `"pago exitoso"`, `"constancia de transferencia"`, `"realizaste una transferencia"`, `"transferencia entre mis cuentas"`

### Notification ID stability

```kotlin
// Stable ID per app+amount+10-minute-window+counterpartyToken.
// Prevents duplicate tiles when Gmail fires onNotificationPosted multiple times, and
// counterpartyToken (extractCounterpartyToken, conservative regex on "X te envió/yapeó/
// pagó/transfirió") separates tiles when 2 same-amount transactions arrive from different
// senders in the same window. No match → empty token → same collapse behavior as before.
val counterpartyToken = extractCounterpartyToken(combined)
val notificationId = notificationIdFor("${appName}:${amount}:${System.currentTimeMillis() / 600_000}:${counterpartyToken}")
```

---

## Stale notification cleanup

Two cleanup paths, both needed:

**1. On service connect** (`onListenerConnected` in `DarkMoneyNotificationListenerService`):
- `cancelStalePendingNotifications()` → `manager.activeNotifications` filtered by `channelId == "movement_detection"` → `manager.cancel(id)` + `NotificationDetectionStore.removePendingSuggestions()`

**2. On JS runtime context** (`setRuntimeContext` in `NotificationDetectionModule`):
- `cancelStaleMovementNotificationsOnVersionChange()` keyed on `NOTIF_CLEANUP_KEY = "YYYY-MM-DD-vN"`
- Bump the key string when you want to force a one-time cleanup on next app open

---

## SharedPreferences store (NotificationDetectionStore.kt)

Prefs name: `"darkmoney_notification_detection"`

Key methods:
- `upsertSuggestion(context, json)` → returns `true` if new or was pending (caller should `notify()`)
- `removePendingSuggestions(context)` → removes only `status == "pending"` entries
- `computeDiscardFingerprint(pkg, content)` / `addDiscardFingerprint` / `isDiscardedFingerprint` → prevents re-detecting dismissed patterns

---

## RN sync layer (hooks/useNotificationDetectionRuntimeSync.ts)

- First `useEffect`: calls `setRuntimeContext` (requires profile + workspace loaded)
- Second `useEffect`: iterates pending suggestions, calls `syncNativeDetectedSuggestion`, runs AI enrichment
- Transfer suggestions skip all AI enrichment (no category/counterparty/cleanup)
- `processedSuggestionIdsRef` prevents re-calling AI on re-renders

---

## Validation checklist for native changes

- [ ] Edited file in `plugins/` AND synced to `android/app/src/main/java/`
- [ ] Deleted Kotlin cache: `android/.gradle`, `android/app/build/tmp/kotlin-classes`
- [ ] Rebuilt: `./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a`
- [ ] Verified DEX contains expected strings: `strings apk_extracted/classes*.dex | grep "..."`
- [ ] Installed: `adb -s <ID> install -r app-release.apk`
- [ ] Tested: open app, observe notification tray, check label, content, and movement type
