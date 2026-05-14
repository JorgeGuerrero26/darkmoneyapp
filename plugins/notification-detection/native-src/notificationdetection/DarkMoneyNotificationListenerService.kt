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
import java.text.Normalizer

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

    if (sourcePackage == GMAIL_PACKAGE && !isFinancialGmailNotification(combined)) return
    if (isPromotionalNotification(combined)) return
    val amount = extractAmount(combined) ?: return
    val detection = inferMovementDetection(combined)
    if (detection.confidence == "low") return
    val appName = readAppName(sourcePackage, combined)
    val financialAppKey = financialAppKeyFor(sourcePackage)
    val suggestionDescription = buildSuggestionDescription(sourcePackage, title, text, bigText, subText, combined)
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
      .put("text", suggestionDescription)
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
      showDetectedMovementNotification(suggestionId, notificationId, appName, amount, detection.movementType, suggestionDescription)
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
    val normalized = normalizeForMatching(value)
    val highIncome = listOf("recibiste", "te enviaron", "te envio", "transferencia recibida", "abono recibido")
    val mediumIncome = listOf("abono", "deposito", "envio un pago", "pago por", "te depositaron")
    val highExpense = listOf(
      "pagaste",
      "enviaste",
      "realizaste un consumo",
      "realizaste una compra",
      "compra realizada",
      "operacion realizada consumo",
      "consumo con tu tarjeta",
    )
    val mediumExpense = listOf("compra aprobada", "consumo", "cargo", "debito", "pago realizado", "se cargo")

    return when {
      highIncome.any { normalized.contains(it) } -> DetectionResult("income", "high")
      highExpense.any { normalized.contains(it) } -> DetectionResult("expense", "high")
      mediumIncome.any { normalized.contains(it) } -> DetectionResult("income", "medium")
      mediumExpense.any { normalized.contains(it) } -> DetectionResult("expense", "medium")
      else -> DetectionResult("unknown", "low")
    }
  }

  private fun isPromotionalNotification(value: String): Boolean {
    val normalized = normalizeForMatching(value)

    val transactionalSignals = listOf(
      "pagaste",
      "enviaste",
      "recibiste",
      "te enviaron",
      "te envió",
      "te envio",
      "compra aprobada",
      "compra realizada",
      "realizaste una compra",
      "realizaste un consumo",
      "consumo con tu tarjeta",
      "consumo aprobado",
      "cargo realizado",
      "operacion realizada",
    )
    if (transactionalSignals.any { normalized.contains(it) }) return false

    val promotionalSignals = listOf(
      "tu compra viene con premio",
      "gana hasta",
      "gana s/",
      "gana soles",
      "premio",
      "premios",
      "promoción",
      "promocion",
      "campaña",
      "campana",
      "sorteo",
      "participa",
      "por cada consumo",
      "por tus consumos",
      "cashback",
      "descuento",
      "oferta",
      "beneficio",
    )

    return promotionalSignals.any { normalized.contains(it) }
  }

  private fun isFinancialGmailNotification(value: String): Boolean {
    if (financialEmailBankLabel(value) == null) return false
    if (extractAmount(value) == null) return false
    if (!hasFinancialEmailTransactionSignal(value)) return false

    val normalized = normalizeForMatching(value)
    val blockedSubjects = listOf(
      "estado de cuenta",
      "promocion",
      "oferta",
      "beneficio",
      "campana",
      "sorteo",
      "premio",
      "publicidad",
    )
    val hasExplicitTransaction = listOf(
      "realizaste un consumo",
      "realizaste una compra",
      "operacion realizada",
      "compra realizada",
      "consumo con tu tarjeta",
      "transferencia recibida",
      "abono recibido",
      "pago realizado",
    ).any { normalized.contains(it) }

    return hasExplicitTransaction || blockedSubjects.none { normalized.contains(it) }
  }

  private fun hasFinancialEmailTransactionSignal(value: String): Boolean {
    val normalized = normalizeForMatching(value)
    val transactionSignals = listOf(
      "realizaste un consumo",
      "realizaste una compra",
      "consumo con tu tarjeta",
      "compra realizada",
      "compra aprobada",
      "operacion realizada",
      "cargo realizado",
      "pago realizado",
      "retiro realizado",
      "transferencia recibida",
      "abono recibido",
      "deposito recibido",
      "te depositaron",
    )
    return transactionSignals.any { normalized.contains(it) }
  }

  private fun buildSuggestionDescription(
    packageName: String,
    title: String,
    text: String,
    bigText: String,
    subText: String,
    combined: String,
  ): String {
    if (packageName == GMAIL_PACKAGE) {
      val merchant = extractFinancialEmailMerchant(combined)
      if (!merchant.isNullOrBlank()) return "Compra en $merchant"
      val bankLabel = financialEmailBankLabel(combined)
      if (!bankLabel.isNullOrBlank()) return "Movimiento $bankLabel"
    }
    return listOf(text, bigText, title, subText)
      .firstOrNull { it.isNotBlank() }
      ?.trim()
      ?.take(240)
      ?: "Movimiento detectado"
  }

  private fun extractFinancialEmailMerchant(value: String): String? {
    val patterns = listOf(
      Regex("""(?i)\bempresa\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})"""),
      Regex("""(?i)\bcomercio\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})"""),
      Regex("""(?i)\bestablecimiento\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})"""),
      Regex("""(?i)\ben\s+([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})(?:[.,\n\r]|$)"""),
    )
    for (pattern in patterns) {
      val raw = pattern.find(value)?.groupValues?.getOrNull(1)?.trim().orEmpty()
      val cleaned = raw
        .replace(Regex("""(?i)\s+(monto|datos|operaci[oó]n|fecha|n[uú]mero|por tu seguridad).*$"""), "")
        .replace(Regex("""\s+"""), " ")
        .trim(' ', '.', ',', '-', ':', ';')
      if (cleaned.length >= 3 && !normalizeForMatching(cleaned).startsWith("tu tarjeta")) return cleaned.take(48)
    }
    return null
  }

  private fun financialEmailBankLabel(value: String): String? {
    val normalized = normalizeForMatching(value)
    return when {
      listOf("notificacionesbcp.com.pe", "viabcp", "banco de credito", " bcp ", "bcp notificaciones").any { normalized.contains(it) } -> "BCP"
      listOf("interbank", "intercorp").any { normalized.contains(it) } -> "Interbank"
      listOf("bbva", "continental").any { normalized.contains(it) } -> "BBVA"
      normalized.contains("scotiabank") -> "Scotiabank"
      normalized.contains("banbif") || normalized.contains("banco interamericano de finanzas") -> "BanBif"
      normalized.contains("pichincha") -> "Banco Pichincha"
      normalized.contains("banco falabella") || normalized.contains("cmr falabella") -> "Banco Falabella"
      normalized.contains("banco ripley") || normalized.contains("tarjeta ripley") -> "Banco Ripley"
      normalized.contains("mibanco") || normalized.contains("mi banco") -> "Mibanco"
      normalized.contains("banco de la nacion") || normalized.contains("bn.com.pe") -> "Banco de la Nación"
      else -> null
    }
  }

  private fun normalizeForMatching(value: String): String {
    val noAccents = Normalizer.normalize(value.lowercase(), Normalizer.Form.NFD)
      .replace(Regex("\\p{Mn}+"), "")
    return " ${noAccents.replace(Regex("\\s+"), " ")} "
  }

  private fun humanAppLabel(packageName: String): String {
    return when (packageName) {
      "com.bcp.innovacxion.yapeapp" -> "Yape"
      "com.bcp.bank.bcp" -> "BCP"
      "pe.com.interbank.mobilebanking" -> "Interbank"
      "com.bbva.nxt_peru" -> "BBVA"
      "pe.com.scotiabank.blpm.android.client" -> "Scotiabank"
      "com.google.android.apps.walletnfcrel" -> "Google Wallet"
      GMAIL_PACKAGE -> "Correos bancarios"
      else -> try {
        val appInfo = packageManager.getApplicationInfo(packageName, 0)
        packageManager.getApplicationLabel(appInfo).toString()
      } catch (_: Exception) {
        packageName
      }
    }
  }

  private fun readAppName(packageName: String, content: String = ""): String {
    if (packageName == GMAIL_PACKAGE) return financialEmailBankLabel(content) ?: "Correos bancarios"
    return humanAppLabel(packageName)
  }

  private fun financialAppKeyFor(packageName: String): String {
    return when (packageName) {
      "com.bcp.bank.bcp" -> "bcp"
      "com.bcp.innovacxion.yapeapp" -> "yape"
      "pe.com.interbank.mobilebanking" -> "interbank"
      "com.bbva.nxt_peru" -> "bbva"
      "pe.com.scotiabank.blpm.android.client" -> "scotiabank"
      "com.google.android.apps.walletnfcrel" -> "google_wallet"
      GMAIL_PACKAGE -> "gmail_financial"
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
    private const val GMAIL_PACKAGE = "com.google.android.gm"
    private var currentService: WeakReference<DarkMoneyNotificationListenerService>? = null

    fun requestActiveScan() {
      currentService?.get()?.processActiveNotifications()
    }
  }
}
