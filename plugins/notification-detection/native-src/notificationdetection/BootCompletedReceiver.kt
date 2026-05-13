package com.darkmoney.app.notificationdetection

import android.content.BroadcastReceiver
import android.content.ComponentName
import android.content.Context
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService

class BootCompletedReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val action = intent.action ?: return
    if (action != Intent.ACTION_BOOT_COMPLETED && action != "android.intent.action.QUICKBOOT_POWERON") return
    if (!NotificationDetectionStore.isEnabled(context)) return
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      try {
        val componentName = ComponentName(context, DarkMoneyNotificationListenerService::class.java)
        NotificationListenerService.requestRebind(componentName)
      } catch (_: Exception) {}
    }
  }
}
