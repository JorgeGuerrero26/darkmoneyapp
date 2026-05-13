package com.darkmoney.app.notificationdetection

import android.content.Context
import android.content.Intent
import android.os.Bundle
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.bridge.Arguments
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class NotificationDetectionSaveTaskService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig? {
    val extras = intent?.extras ?: return null
    return HeadlessJsTaskConfig(
      "NotificationDetectionSaveTask",
      Arguments.fromBundle(extras),
      30_000,
      true,
    )
  }

  companion object {
    fun start(
      context: Context,
      suggestionId: String,
      notificationId: Int,
      workspaceId: Int?,
      movementType: String,
      amount: String,
      accountId: Int,
      categoryId: Int?,
      newCategoryName: String?,
      description: String,
    ) {
      val extras = Bundle().apply {
        putString("suggestionId", suggestionId)
        putInt("notificationId", notificationId)
        if (workspaceId != null) putInt("workspaceId", workspaceId)
        putString("movementType", movementType)
        putString("amount", amount)
        putInt("accountId", accountId)
        if (categoryId != null) putInt("categoryId", categoryId)
        if (!newCategoryName.isNullOrBlank()) putString("newCategoryName", newCategoryName)
        putString("description", description)
      }
      val intent = Intent(context, NotificationDetectionSaveTaskService::class.java).putExtras(extras)
      context.startService(intent)
      HeadlessJsTaskService.acquireWakeLockNow(context)
    }
  }
}
