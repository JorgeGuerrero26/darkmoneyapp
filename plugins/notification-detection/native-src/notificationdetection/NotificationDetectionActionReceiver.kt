package com.darkmoney.app.notificationdetection

import android.app.NotificationManager
import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent

class NotificationDetectionActionReceiver : BroadcastReceiver() {
  override fun onReceive(context: Context, intent: Intent) {
    val suggestionId = intent.getStringExtra(EXTRA_SUGGESTION_ID) ?: return
    val notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)

    when (intent.action) {
      ACTION_DISCARD -> {
        val suggestion = NotificationDetectionStore.getSuggestion(context, suggestionId)
        val fingerprint = suggestion?.optString("discardFingerprint")
        if (!fingerprint.isNullOrBlank()) {
          NotificationDetectionStore.addDiscardFingerprint(context, fingerprint)
        }
        NotificationDetectionStore.markStatus(context, suggestionId, "discarded")
        if (notificationId > 0) {
          context.getSystemService(NotificationManager::class.java).cancel(notificationId)
        }
      }
    }
  }

  companion object {
    const val ACTION_DISCARD = "com.darkmoney.app.notificationdetection.DISCARD"
    const val EXTRA_SUGGESTION_ID = "suggestionId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
  }
}
