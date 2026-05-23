package com.darkmoney.app.notificationdetection

import android.app.NotificationManager
import android.app.Notification
import android.app.NotificationChannel
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import android.service.notification.NotificationListenerService
import com.darkmoney.app.R
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray

class NotificationDetectionModule(
  private val reactContext: ReactApplicationContext,
) : ReactContextBaseJavaModule(reactContext) {
  override fun getName(): String = "NotificationDetection"

  companion object {
    private const val NOTIF_CLEANUP_KEY = "2026-05-16-v1"
  }

  @ReactMethod
  fun isNotificationAccessEnabled(promise: Promise) {
    promise.resolve(hasNotificationListenerAccess())
  }

  @ReactMethod
  fun openNotificationAccessSettings() {
    val intent = Intent(Settings.ACTION_NOTIFICATION_LISTENER_SETTINGS)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun canDrawOverlays(promise: Promise) {
    promise.resolve(Settings.canDrawOverlays(reactContext))
  }

  @ReactMethod
  fun openOverlaySettings() {
    val intent = Intent(
      Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
      Uri.parse("package:${reactContext.packageName}"),
    ).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    reactContext.startActivity(intent)
  }

  @ReactMethod
  fun getDetectionEnabled(promise: Promise) {
    promise.resolve(NotificationDetectionStore.isEnabled(reactContext))
  }

  @ReactMethod
  fun setDetectionEnabled(enabled: Boolean) {
    NotificationDetectionStore.setEnabled(reactContext, enabled)
    if (enabled) requestListenerRebind()
  }

  @ReactMethod
  fun getDefaultAllowedPackages(promise: Promise) {
    promise.resolve(NotificationDetectionSerializer.toWritableArray(NotificationDetectionStore.defaultAllowedPackages))
  }

  @ReactMethod
  fun getAllowedPackages(promise: Promise) {
    promise.resolve(NotificationDetectionSerializer.toWritableArray(NotificationDetectionStore.getAllowedPackages(reactContext)))
  }

  @ReactMethod
  fun setAllowedPackages(packages: ReadableArray) {
    val values = mutableSetOf<String>()
    for (index in 0 until packages.size()) {
      val value = packages.getString(index)?.trim().orEmpty()
      if (value.isNotBlank()) values.add(value)
    }
    NotificationDetectionStore.setAllowedPackages(reactContext, values)
    requestListenerRebind()
  }

  @ReactMethod
  fun setRuntimeContext(contextJson: String) {
    cancelStaleMovementNotificationsOnVersionChange()
    NotificationDetectionStore.setRuntimeContext(reactContext, contextJson)
  }

  private fun cancelStaleMovementNotificationsOnVersionChange() {
    val prefs = reactContext.getSharedPreferences("darkmoney_notification_detection", android.content.Context.MODE_PRIVATE)
    val storedCleanupKey = prefs.getString("last_notif_cleanup_key", "")
    android.util.Log.d("DarkMoneyND", "cancelStale: stored=$storedCleanupKey current=$NOTIF_CLEANUP_KEY")
    if (storedCleanupKey == NOTIF_CLEANUP_KEY) return
    prefs.edit().putString("last_notif_cleanup_key", NOTIF_CLEANUP_KEY).apply()
    val manager = reactContext.getSystemService(android.app.NotificationManager::class.java)
    if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.M) {
      val active = manager.activeNotifications
      android.util.Log.d("DarkMoneyND", "cancelStale: activeNotifications count=${active.size}")
      active.forEach { sbn ->
        val channelId = if (android.os.Build.VERSION.SDK_INT >= android.os.Build.VERSION_CODES.O) sbn.notification.channelId else "n/a"
        android.util.Log.d("DarkMoneyND", "cancelStale: notif id=${sbn.id} channel=$channelId")
        val isMoveChannel = android.os.Build.VERSION.SDK_INT < android.os.Build.VERSION_CODES.O ||
          channelId == "movement_detection"
        if (isMoveChannel) {
          manager.cancel(sbn.id)
          android.util.Log.d("DarkMoneyND", "cancelStale: cancelled id=${sbn.id}")
        }
      }
    }
    NotificationDetectionStore.removePendingSuggestions(reactContext)
    android.util.Log.d("DarkMoneyND", "cancelStale: removePendingSuggestions done")
  }

  @ReactMethod
  fun requestActiveNotificationScan() {
    DarkMoneyNotificationListenerService.requestActiveScan()
    requestListenerRebind()
  }

  @ReactMethod
  fun getSuggestions(promise: Promise) {
    promise.resolve(NotificationDetectionSerializer.toWritableArray(NotificationDetectionStore.getSuggestions(reactContext)))
  }

  @ReactMethod
  fun discardSuggestion(suggestionId: String) {
    val suggestion = NotificationDetectionStore.getSuggestion(reactContext, suggestionId)
    val fingerprint = suggestion?.optString("discardFingerprint")
    if (!fingerprint.isNullOrBlank()) {
      NotificationDetectionStore.addDiscardFingerprint(reactContext, fingerprint)
    }
    NotificationDetectionStore.markStatus(reactContext, suggestionId, "discarded")
    val notificationId = suggestion?.optInt("notificationId", 0) ?: 0
    if (notificationId > 0) {
      reactContext.getSystemService(NotificationManager::class.java).cancel(notificationId)
    }
  }

  @ReactMethod
  fun markSuggestionRegistered(suggestionId: String, notificationId: Int) {
    NotificationDetectionStore.markStatus(reactContext, suggestionId, "registered")
    if (notificationId > 0) {
      reactContext.getSystemService(NotificationManager::class.java).cancel(notificationId)
    }
  }

  @ReactMethod
  fun setSuggestionAiCategoryRecommendation(suggestionId: String, recommendationJson: String) {
    NotificationDetectionStore.setAiCategoryRecommendation(reactContext, suggestionId, recommendationJson)
  }

  @ReactMethod
  fun setSuggestionDescriptionCleanup(suggestionId: String, cleanupJson: String) {
    NotificationDetectionStore.setDescriptionCleanup(reactContext, suggestionId, cleanupJson)
  }

  @ReactMethod
  fun setSuggestionCounterpartyRecommendation(suggestionId: String, recommendationJson: String) {
    NotificationDetectionStore.setCounterpartyRecommendation(reactContext, suggestionId, recommendationJson)
  }

  @ReactMethod
  fun setSuggestionRecurringRecommendation(suggestionId: String, recommendationJson: String) {
    NotificationDetectionStore.setRecurringRecommendation(reactContext, suggestionId, recommendationJson)
  }

  @ReactMethod
  fun setSuggestionRiskExplanation(suggestionId: String, explanationJson: String) {
    NotificationDetectionStore.setRiskExplanation(reactContext, suggestionId, explanationJson)
  }

  @ReactMethod
  fun setSuggestionBudgetImpact(suggestionId: String, impactJson: String) {
    NotificationDetectionStore.setBudgetImpact(reactContext, suggestionId, impactJson)
  }

  @ReactMethod
  fun isIgnoringBatteryOptimizations(promise: Promise) {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
      promise.resolve(true)
      return
    }
    val pm = reactContext.getSystemService(PowerManager::class.java)
    promise.resolve(pm.isIgnoringBatteryOptimizations(reactContext.packageName))
  }

  @ReactMethod
  fun requestIgnoreBatteryOptimizations() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return
    try {
      val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS)
        .setData(Uri.parse("package:${reactContext.packageName}"))
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      reactContext.startActivity(intent)
    } catch (_: Exception) {
      val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS)
        .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
      try { reactContext.startActivity(fallback) } catch (_: Exception) {}
    }
  }

  @ReactMethod
  fun showSuggestionNotification(suggestionId: String) {
    val suggestion = NotificationDetectionStore.getSuggestion(reactContext, suggestionId) ?: return
    showDetectedMovementNotification(
      suggestionId = suggestion.optString("id"),
      notificationId = suggestion.optInt("notificationId", suggestion.optString("id").hashCode() and 0x7fffffff),
      appName = suggestion.optString("appName", suggestion.optString("packageName")),
      amount = suggestion.optString("amountLabel"),
      description = suggestion.optString("text").ifBlank { suggestion.optString("title") },
    )
  }

  private fun hasNotificationListenerAccess(): Boolean {
    val componentName = ComponentName(reactContext, DarkMoneyNotificationListenerService::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O_MR1) {
      val manager = reactContext.getSystemService(NotificationManager::class.java)
      return manager.isNotificationListenerAccessGranted(componentName)
    }

    val enabledListeners = Settings.Secure.getString(
      reactContext.contentResolver,
      "enabled_notification_listeners",
    ) ?: return false
    return enabledListeners.split(":").any { it.equals(componentName.flattenToString(), ignoreCase = true) }
  }

  private fun requestListenerRebind() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.N) return
    val componentName = ComponentName(reactContext, DarkMoneyNotificationListenerService::class.java)
    try {
      NotificationListenerService.requestRebind(componentName)
    } catch (_: Exception) {
      // Best-effort only. If Android refuses rebind, onNotificationPosted still works.
    }
  }

  private fun showDetectedMovementNotification(
    suggestionId: String,
    notificationId: Int,
    appName: String,
    amount: String,
    description: String,
  ) {
    val manager = reactContext.getSystemService(NotificationManager::class.java)
    val channelId = "movement_detection"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(channelId, "Movimientos detectados", NotificationManager.IMPORTANCE_HIGH),
      )
    }

    val quickIntent = Intent(reactContext, QuickMovementDialogActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
      .putExtra(QuickMovementDialogActivity.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(QuickMovementDialogActivity.EXTRA_NOTIFICATION_ID, notificationId)
    val quickPendingIntent = PendingIntent.getActivity(
      reactContext,
      notificationId,
      quickIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val openAppIntent = Intent(Intent.ACTION_VIEW, Uri.parse("darkmoney://detected-suggestion/$suggestionId"))
      .setComponent(ComponentName(reactContext, "com.darkmoney.app.MainActivity"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val openAppPendingIntent = PendingIntent.getActivity(
      reactContext,
      notificationId + 2,
      openAppIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val discardIntent = Intent(reactContext, NotificationDetectionActionReceiver::class.java)
      .setAction(NotificationDetectionActionReceiver.ACTION_DISCARD)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
    val discardPendingIntent = PendingIntent.getBroadcast(
      reactContext,
      notificationId + 1,
      discardIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val ignoreIntent = Intent(reactContext, NotificationDetectionActionReceiver::class.java)
      .setAction(NotificationDetectionActionReceiver.ACTION_IGNORE)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
    val ignorePendingIntent = PendingIntent.getBroadcast(
      reactContext,
      notificationId + 3,
      ignoreIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val body = listOf(appName, amount, description.take(56))
      .filter { it.isNotBlank() }
      .joinToString(" · ")

    val notification = Notification.Builder(reactContext, channelId)
      .setSmallIcon(R.mipmap.ic_launcher)
      .setContentTitle("Movimiento detectado")
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setContentIntent(openAppPendingIntent)
      .setAutoCancel(true)
      .addAction(Notification.Action.Builder(0, "Registro rápido", quickPendingIntent).build())
      .addAction(Notification.Action.Builder(0, "Ignorar", ignorePendingIntent).build())
      .addAction(Notification.Action.Builder(0, "No mostrar más", discardPendingIntent).build())
      .build()

    manager.notify(notificationId, notification)
  }
}
