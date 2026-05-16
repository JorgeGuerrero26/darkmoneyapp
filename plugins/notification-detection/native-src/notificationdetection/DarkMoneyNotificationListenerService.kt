package com.darkmoney.app.notificationdetection

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.content.ComponentName
import android.content.Intent
import android.net.Uri
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
    cancelStalePendingNotifications()
    processActiveNotifications()
  }

  private fun cancelStalePendingNotifications() {
    android.util.Log.d("DarkMoneyND", "onListenerConnected: cancelStalePendingNotifications start")
    val manager = getSystemService(NotificationManager::class.java)
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) {
      val active = manager.activeNotifications
      android.util.Log.d("DarkMoneyND", "onListenerConnected: activeNotifications count=${active.size}")
      active.forEach { sbn ->
        val channelId = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) sbn.notification.channelId else "n/a"
        android.util.Log.d("DarkMoneyND", "onListenerConnected: notif id=${sbn.id} channel=$channelId")
        val isMoveChannel = Build.VERSION.SDK_INT < Build.VERSION_CODES.O || channelId == "movement_detection"
        if (isMoveChannel) {
          manager.cancel(sbn.id)
          android.util.Log.d("DarkMoneyND", "onListenerConnected: cancelled id=${sbn.id}")
        }
      }
    }
    NotificationDetectionStore.removePendingSuggestions(applicationContext)
    android.util.Log.d("DarkMoneyND", "onListenerConnected: cancelStalePendingNotifications done")
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
    val discardFingerprint = NotificationDetectionStore.computeDiscardFingerprint(sourcePackage, combined)
    if (NotificationDetectionStore.isDiscardedFingerprint(applicationContext, discardFingerprint)) return
    val amount = extractAmount(combined) ?: return
    val detection = inferMovementDetection(combined)
    if (detection.confidence == "low") return
    val appName = readAppName(sourcePackage, combined)
    val financialAppKey = financialAppKeyFor(sourcePackage)
    val suggestionDescription = buildSuggestionDescription(sourcePackage, title, text, bigText, subText, combined, detection.movementType)
    val suggestionId = NotificationDetectionStore.createSuggestionId(
      sourcePackage,
      sbn.key.orEmpty(),
      combined,
      amount,
    )
    // Use source+amount+10min-bucket as notification ID so that when Gmail
    // updates its notification with more content (different combined → different
    // suggestionId), Android updates the existing DarkMoney tile instead of
    // adding a duplicate.
    val notificationId = notificationIdFor("${sourcePackage}:${amount}:${System.currentTimeMillis() / 600_000}")

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
      .put("discardFingerprint", discardFingerprint)

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
      "yapaste",
      "yapear exitosamente",
      "yapeo exitoso",
      "yapeo aprobado",
      "monto de yapeo",
      "pago exitoso",
      "realizaste un consumo",
      "realizaste una compra",
      "compra realizada",
      "operacion realizada consumo",
      "consumo con tu tarjeta",
    )
    val mediumExpense = listOf("compra aprobada", "consumo", "cargo", "debito", "pago realizado", "se cargo")
    val transferSignals = listOf(
      "transferencia entre mis cuentas",
      "transferencia entre tus cuentas",
      "constancia de transferencia",
    )
    val isOwnTransfer = transferSignals.any { normalized.contains(it) } ||
      (normalized.contains("realizaste una transferencia") &&
        (normalized.contains("entre mis cuentas") || normalized.contains("desde tu")))

    return when {
      isOwnTransfer -> DetectionResult("transfer", "high")
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
      "yapear exitosamente",
      "yapaste",
      "yapeo aprobado",
      "monto de yapeo",
      "pago exitoso",
      "constancia de transferencia",
      "realizaste una transferencia",
      "transferencia entre mis cuentas",
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
      "te ofrecemos",
      "millas",
      "pidela",
      "pidelo",
      "por confiar en nosotros",
      "te invitamos",
      "solicita tu",
      "solicita la",
      "te quedan menos de",
      "te quedan solo",
    )

    return promotionalSignals.any { normalized.contains(it) }
  }

  private fun isFinancialGmailNotification(value: String): Boolean {
    val bankLabel = financialEmailBankLabel(value) ?: return false
    if (extractAmount(value) == null) return false

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

    // Correos Yape: el preview suele traer solo el asunto + "Monto de yapeo* S/ X",
    // sin "yapear exitosamente". Aceptamos con señal yape + sin asunto promocional.
    if (bankLabel == "Yape") {
      val yapeTxn = listOf("monto de yapeo", "yapear", "yapaste", "yapeo", "pago exitoso", "fue exitoso").any { normalized.contains(it) }
      if (yapeTxn) return blockedSubjects.none { normalized.contains(it) }
    }

    if (!hasFinancialEmailTransactionSignal(value)) return false

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
      "yapear exitosamente",
      "yapaste",
      "yapeo exitoso",
      "monto de yapeo",
      "pago exitoso",
      "realizaste una transferencia",
      "transferencia entre mis cuentas",
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
    movementType: String = "expense",
  ): String {
    if (packageName == GMAIL_PACKAGE) {
      val bankLabel = financialEmailBankLabel(combined)
      if (movementType == "transfer") {
        return if (!bankLabel.isNullOrBlank()) "Transferencia $bankLabel" else "Transferencia BCP"
      }
      val merchant = extractFinancialEmailMerchant(combined)
      if (!merchant.isNullOrBlank()) return "Compra en $merchant"
      if (!bankLabel.isNullOrBlank()) return "Movimiento $bankLabel"
    }
    return listOf(text, bigText, title, subText)
      .firstOrNull { it.isNotBlank() }
      ?.trim()
      ?.take(240)
      ?: "Movimiento detectado"
  }

  private fun extractFinancialEmailMerchant(value: String): String? {
    // Only search the first 400 chars — merchant fields appear near the top;
    // the BCP security disclaimer at the bottom contains "en sorteos o promociones"
    // which would otherwise be captured as a false merchant name.
    val patterns = listOf(
      Regex("""(?i)\bempresa\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})"""),
      Regex("""(?i)\bcomercio\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})"""),
      Regex("""(?i)\bestablecimiento\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})"""),
      Regex("""(?i)\ben\s+([A-Z0-9ÁÉÍÓÚÑ&.' \-]{3,60})(?:[.,\n\r]|$)"""),
    )
    for (pattern in patterns) {
      val raw = pattern.find(value.take(400))?.groupValues?.getOrNull(1)?.trim().orEmpty()
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
      listOf("yape.pe", "yapeapp", "@yape", "yape notificaciones").any { normalized.contains(it) } || (normalized.contains("yape") && (normalized.contains("yapear") || normalized.contains("yapeo") || normalized.contains("yapaste"))) -> "Yape"
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

    // "Registro rápido": abre el overlay nativo (sin abrir la app) vía Activity lanzadora.
    val quickIntent = Intent(this, QuickMovementDialogActivity::class.java)
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_NO_ANIMATION)
      .putExtra(QuickMovementDialogActivity.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(QuickMovementDialogActivity.EXTRA_NOTIFICATION_ID, notificationId)
    val quickPendingIntent = PendingIntent.getActivity(
      this,
      notificationId,
      quickIntent,
      PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    // Tap en el cuerpo: abre la app (deep-link) al movimiento detectado. No es trampoline.
    val openAppIntent = Intent(Intent.ACTION_VIEW, Uri.parse("darkmoney://detected-suggestion/$suggestionId"))
      .setComponent(ComponentName(this, "com.darkmoney.app.MainActivity"))
      .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
    val openAppPendingIntent = PendingIntent.getActivity(
      this,
      notificationId + 2,
      openAppIntent,
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
      .setContentIntent(openAppPendingIntent)
      .setAutoCancel(true)
      .addAction(Notification.Action.Builder(0, "Registro rápido", quickPendingIntent).build())
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
