package com.darkmoney.app.notificationdetection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.Intent
import android.os.Build
import android.service.notification.NotificationListenerService
import android.service.notification.StatusBarNotification
import com.darkmoney.app.R
import org.json.JSONObject
import java.lang.ref.WeakReference

class DarkMoneyNotificationListenerService : NotificationListenerService() {
  override fun onListenerConnected() {
    super.onListenerConnected()
    currentService = WeakReference(this)
    processActiveNotifications()
  }

  override fun onListenerDisconnected() {
    super.onListenerDisconnected()
    currentService?.clear()
    currentService = null
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    processStatusBarNotification(sbn)
  }

  fun processActiveNotifications() {
    val notifications = try {
      activeNotifications ?: emptyArray()
    } catch (_: Exception) {
      emptyArray()
    }

    notifications.forEach { processStatusBarNotification(it) }
  }

  private fun processStatusBarNotification(sbn: StatusBarNotification) {
    val context = applicationContext
    val sourcePackage = sbn.packageName ?: return

    if (sourcePackage == packageName) return
    if (!NotificationDetectionStore.isEnabled(context)) return
    if (!NotificationDetectionStore.isAllowedPackage(context, sourcePackage)) return

    val extras = sbn.notification.extras
    val title = extras.getCharSequence(Notification.EXTRA_TITLE)?.toString().orEmpty()
    val text = extras.getCharSequence(Notification.EXTRA_TEXT)?.toString().orEmpty()
    val bigText = extras.getCharSequence(Notification.EXTRA_BIG_TEXT)?.toString().orEmpty()
    val subText = extras.getCharSequence(Notification.EXTRA_SUB_TEXT)?.toString().orEmpty()
    val combined = listOf(title, text, bigText, subText)
      .filter { it.isNotBlank() }
      .joinToString(" · ")

    val amount = extractAmount(combined) ?: return
    val detection = inferMovementDetection(combined)
    if (detection.confidence == "low") return
    val appName = readAppName(sourcePackage)
    val financialAppKey = financialAppKeyFor(sourcePackage)
    val suggestionId = NotificationDetectionStore.createSuggestionId(
      sourcePackage,
      sbn.key.orEmpty(),
      combined,
      amount,
    )
    val notificationId = notificationIdFor(suggestionId)

    val suggestion = JSONObject()
      .put("id", suggestionId)
      .put("status", "pending")
      .put("packageName", sourcePackage)
      .put("financialAppKey", financialAppKey)
      .put("appName", appName)
      .put("title", title)
      .put("text", text.ifBlank { bigText })
      .put("subText", subText)
      .put("postTime", sbn.postTime)
      .put("notificationKey", sbn.key.orEmpty())
      .put("amountLabel", amount)
      .put("movementType", detection.movementType)
      .put("confidence", detection.confidence)
      .put("createdAt", System.currentTimeMillis())
      .put("notificationId", notificationId)

    val shouldNotify = NotificationDetectionStore.upsertSuggestion(context, suggestion)
    if (shouldNotify) {
      showDetectedMovementNotification(suggestionId, notificationId, appName, amount, detection.movementType, text.ifBlank { title })
    }
  }

  private fun extractAmount(value: String): String? {
    val regex = Regex("""(?i)(S/|S\.|PEN|US\$|USD|\$)\s*([0-9]+(?:[.,][0-9]{1,2})?)""")
    val match = regex.find(value) ?: return null
    val symbol = match.groupValues[1].uppercase()
    val amount = match.groupValues[2]
    return when {
      symbol.contains("USD") || symbol.contains("$") -> "USD $amount"
      else -> "S/ $amount"
    }
  }

  private fun inferMovementDetection(value: String): DetectionResult {
    val normalized = value.lowercase()
    val highIncome = listOf("recibiste", "te enviaron", "te envió", "te envio", "transferencia recibida")
    val mediumIncome = listOf("abono", "depósito", "deposito", "envió un pago", "envio un pago", "pago por")
    val highExpense = listOf("pagaste", "enviaste")
    val mediumExpense = listOf("compra aprobada", "consumo", "cargo", "débito", "debito")

    return when {
      highIncome.any { normalized.contains(it) } -> DetectionResult("income", "high")
      highExpense.any { normalized.contains(it) } -> DetectionResult("expense", "high")
      mediumIncome.any { normalized.contains(it) } -> DetectionResult("income", "medium")
      mediumExpense.any { normalized.contains(it) } -> DetectionResult("expense", "medium")
      else -> DetectionResult("unknown", "low")
    }
  }

  private fun humanAppLabel(packageName: String): String {
    return when (packageName) {
      "com.bcp.innovacxion.yapeapp" -> "Yape"
      "com.bcp.bank.bcp" -> "BCP"
      "pe.com.interbank.mobilebanking" -> "Interbank"
      "com.bbva.nxt_peru" -> "BBVA"
      "pe.com.scotiabank.blpm.android.client" -> "Scotiabank"
      "com.google.android.apps.walletnfcrel" -> "Google Wallet"
      else -> try {
        val appInfo = packageManager.getApplicationInfo(packageName, 0)
        packageManager.getApplicationLabel(appInfo).toString()
      } catch (_: Exception) {
        packageName
      }
    }
  }

  private fun readAppName(packageName: String): String = humanAppLabel(packageName)

  private fun financialAppKeyFor(packageName: String): String {
    return when (packageName) {
      "com.bcp.innovacxion.yapeapp" -> "yape"
      "pe.com.interbank.mobilebanking" -> "interbank"
      "com.bbva.nxt_peru" -> "bbva"
      "pe.com.scotiabank.blpm.android.client" -> "scotiabank"
      "com.google.android.apps.walletnfcrel" -> "google_wallet"
      else -> "yape"
    }
  }

  private fun showDetectedMovementNotification(
    suggestionId: String,
    notificationId: Int,
    appName: String,
    amount: String,
    movementType: String,
    description: String,
  ) {
    val manager = getSystemService(NotificationManager::class.java)
    val channelId = "movement_detection"
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      manager.createNotificationChannel(
        NotificationChannel(channelId, "Movimientos detectados", NotificationManager.IMPORTANCE_HIGH),
      )
    }

    val registerIntent = Intent(this, NotificationDetectionActionReceiver::class.java)
      .setAction(NotificationDetectionActionReceiver.ACTION_REGISTER)
      .putExtra(QuickMovementDialogActivity.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(QuickMovementDialogActivity.EXTRA_NOTIFICATION_ID, notificationId)
    val registerPendingIntent = PendingIntent.getBroadcast(
      this,
      notificationId,
      registerIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val discardIntent = Intent(this, NotificationDetectionActionReceiver::class.java)
      .setAction(NotificationDetectionActionReceiver.ACTION_DISCARD)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
    val discardPendingIntent = PendingIntent.getBroadcast(
      this,
      notificationId + 1,
      discardIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val descClean = description
      .replace(Regex("""(?i)(S/|S\.|PEN|US\$|USD|\$)\s*[0-9]+(?:[.,][0-9]{1,2})?"""), "")
      .replace(Regex("""^[\s·.\-,]+|[\s·.\-,]+$"""), "")
      .trim()
    val body = listOf(appName, amount, descClean.take(56).ifBlank { null })
      .filterNotNull()
      .filter { it.isNotBlank() }
      .joinToString(" · ")

    val notification = Notification.Builder(this, channelId)
      .setSmallIcon(R.mipmap.ic_launcher_foreground)
      .setContentTitle("Movimiento detectado")
      .setContentText(body)
      .setStyle(Notification.BigTextStyle().bigText(body))
      .setContentIntent(registerPendingIntent)
      .setAutoCancel(true)
      .addAction(Notification.Action.Builder(0, "Registrar", registerPendingIntent).build())
      .addAction(Notification.Action.Builder(0, "Descartar", discardPendingIntent).build())
      .setExtras(android.os.Bundle().apply {
        putString("suggestionId", suggestionId)
        putString("movementType", movementType)
      })
      .build()

    manager.notify(notificationId, notification)
  }

  private fun notificationIdFor(suggestionId: String): Int {
    return suggestionId.hashCode() and 0x7fffffff
  }

  private data class DetectionResult(
    val movementType: String,
    val confidence: String,
  )

  companion object {
    private var currentService: WeakReference<DarkMoneyNotificationListenerService>? = null

    fun requestActiveScan() {
      currentService?.get()?.processActiveNotifications()
    }
  }
}
