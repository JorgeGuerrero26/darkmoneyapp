package com.darkmoney.app.notificationdetection

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import android.provider.Settings

class NotificationDetectionActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val suggestionId = intent.getStringExtra(EXTRA_SUGGESTION_ID) ?: return
    val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)

    when (intent.action) {
      ACTION_REGISTER -> {
        if (Settings.canDrawOverlays(context)) {
          QuickMovementOverlay.show(context.applicationContext, suggestionId, notificationId)
        } else {
          val fallbackIntent = Intent(context, QuickMovementDialogActivity::class.java)
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
            .putExtra(QuickMovementDialogActivity.EXTRA_SUGGESTION_ID, suggestionId)
            .putExtra(QuickMovementDialogActivity.EXTRA_NOTIFICATION_ID, notificationId)
          context.startActivity(fallbackIntent)
        }
      }
      ACTION_DISCARD -> {
        NotificationDetectionStore.markStatus(context, suggestionId, "discarded")
        if (notificationId > 0) {
          context.getSystemService(NotificationManager::class.java).cancel(notificationId)
        }
      }
    }
  }

  companion object {
    const val ACTION_REGISTER = "com.darkmoney.app.notificationdetection.REGISTER"
    const val ACTION_DISCARD = "com.darkmoney.app.notificationdetection.DISCARD"
    const val EXTRA_SUGGESTION_ID = "suggestionId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
  }
}
