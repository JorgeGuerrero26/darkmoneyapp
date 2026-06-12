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
    consumePendingCancellations(this)
    NotificationDetectionStore.pruneSuggestions(applicationContext)
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
    // Samsung/Android matan el listener cuando la app está cerrada (optimización de batería).
    // Sin pedir rebind, el servicio queda muerto y NO captura notificaciones nuevas hasta que
    // el usuario entra a la pantalla de config (que llama requestRebind manualmente). Pedir
    // rebind aquí hace que Android lo reconecte solo, restaurando la detección en tiempo real.
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
      try {
        requestRebind(ComponentName(applicationContext, DarkMoneyNotificationListenerService::class.java))
      } catch (_: Exception) {
        // Best-effort: si Android rechaza el rebind, el BootCompletedReceiver / abrir la app lo recupera.
      }
    }
  }

  override fun onNotificationPosted(sbn: StatusBarNotification) {
    consumePendingCancellations(this)
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
    val textLines = extras.getCharSequenceArray(Notification.EXTRA_TEXT_LINES)
      ?.map { it.toString() }
      ?.filter { it.isNotBlank() }
      ?.joinToString(" · ")
      .orEmpty()
    val combined = listOf(title, text, bigText, textLines, subText)
      .filter { it.isNotBlank() }
      .joinToString(" · ")

    // Observabilidad: cada descarte de un paquete PERMITIDO deja su motivo en logcat (Log.w
    // porque Log.d se filtra en release en Samsung). Diagnóstico: adb logcat -d | grep DarkMoneyND
    fun drop(reason: String) {
      android.util.Log.w("DarkMoneyND", "drop[$reason] pkg=$sourcePackage")
    }

    if (sourcePackage == GMAIL_PACKAGE && !isFinancialGmailNotification(combined)) {
      drop("gmail-gate")
      return
    }
    if (isPromotionalNotification(combined)) {
      drop("promotional")
      return
    }
    val discardFingerprint = NotificationDetectionStore.computeDiscardFingerprint(sourcePackage, combined)
    if (NotificationDetectionStore.isDiscardedFingerprint(applicationContext, discardFingerprint)) {
      drop("discard-fingerprint")
      return
    }
    val amount = extractAmount(combined) ?: run {
      drop("no-amount")
      return
    }
    // Si ESTA MISMA transacción (huella + mismo monto) ya se registró hace poco, no re-disparar.
    // Cubre registrar con la app cerrada y reabrir con la notif. bancaria aún en bandeja. La huella
    // sola NO basta (ignora el monto), por eso exigimos amount + ventana corta: así una compra
    // nueva del mismo banco con otro monto sí se detecta.
    if (NotificationDetectionStore.hasRecentRegisteredSuggestion(applicationContext, discardFingerprint, amount, withinMs = 30 * 60_000L)) {
      drop("registered-recent")
      return
    }
    // Cross-source dedup: otra FUENTE (banco vs Gmail vs Google Wallet vs Samsung Pay) se salta
    // si ya existe una pending suggestion del mismo monto en los últimos 5 min. Política: el
    // primero llegado gana. Cubre BCP push + BCP email + Wallet/SPay para una misma transacción.
    // Mismo paquete NO se suprime: dos compras reales del mismo monto y misma fuente en <5 min
    // (p. ej. vending machine) son transacciones distintas; los re-fires del mismo contenido ya
    // los dedupea suggestionId vía upsertSuggestion.
    if (NotificationDetectionStore.hasPendingSuggestionForAmount(context, sourcePackage, amount, withinMs = 5 * 60_000L)) {
      drop("pending-amount-dedupe")
      return
    }
    val detection = inferMovementDetection(combined)
    if (detection.confidence == "low") {
      drop("low-confidence")
      return
    }
    val appName = readAppName(sourcePackage, combined)
    val financialAppKey = financialAppKeyFor(sourcePackage)
    val suggestionDescription = buildSuggestionDescription(sourcePackage, title, text, bigText, subText, combined, detection.movementType)
    val suggestionId = NotificationDetectionStore.createSuggestionId(
      sourcePackage,
      sbn.key.orEmpty(),
      combined,
      amount,
    )
    // Use financialApp+amount+10min-bucket as notification ID so that:
    // 1. Cross-source detections of the same transaction (Yape push + Yape email)
    //    collapse into one tile (manager.notify with same ID replaces).
    // 2. Gmail re-fires (different content → different suggestionId) also collapse.
    // Si la sugerencia YA existe (re-escaneo de bandeja), reusar su tile id: un re-proceso en
    // otro bucket de 10 min debe REEMPLAZAR la misma tile, no crear una duplicada.
    val existingSuggestion = NotificationDetectionStore.getSuggestion(context, suggestionId)
    val notificationId = existingSuggestion?.optInt("notificationId", 0)?.takeIf { it > 0 }
      ?: notificationIdFor("${appName}:${amount}:${System.currentTimeMillis() / 600_000}")

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

    NotificationDetectionStore.upsertSuggestion(context, suggestion)
    // Notificar SOLO sugerencias nuevas. Un re-proceso de una sugerencia ya rastreada (p. ej.
    // re-escaneo de bandeja al volver la app a foreground) NO debe re-disparar la tile: si el
    // registro headless está en vuelo (la sugerencia sigue "pending" y la notif bancaria aún no
    // se canceló), re-notificar hace reaparecer "movimiento detectado" durante el guardado.
    // El caso "listener muerto" sigue cubierto: el rebind (onListenerConnected) limpia las
    // pendientes y las re-crea desde la bandeja como NUEVAS → la tile se re-dispara ahí.
    val shouldNotify = existingSuggestion == null
    if (!shouldNotify) {
      drop("already-tracked")
    }
    if (shouldNotify) {
      showDetectedMovementNotification(suggestionId, notificationId, appName, amount, detection.movementType, suggestionDescription)
      // Pre-cómputo IA: dispara el headless task de enrichment ya, sin esperar a que el usuario
      // toque "Registro rápido". Cuando abra el overlay, la categoría IA ya estará lista en
      // SharedPreferences. Requiere workspaceId del runtimeContext — si no lo hay (sesión vacía),
      // se salta y el overlay caerá al local-only.
      // En re-escaneos NO re-disparar si ya hay una recomendación terminal (resuelta, unavailable
      // o local_confirmed): evita re-llamar a DeepSeek en cada apertura de la app. Solo se
      // reintenta si quedó "pending" (enrichment interrumpido) o nunca corrió.
      val existingRecommendation = existingSuggestion?.optJSONObject("aiCategoryRecommendation")
      val needsEnrichment = existingRecommendation == null ||
        existingRecommendation.optString("status") == "pending"
      if (detection.movementType != "transfer" && needsEnrichment) {
        val runtimeContext = NotificationDetectionStore.getRuntimeContext(context)
        val workspaceId = runtimeContext.optInt("workspaceId", 0).takeIf { it > 0 }
        if (workspaceId != null) {
          NotificationDetectionSaveTaskService.startAiCategoryEnrichment(
            context,
            suggestionId,
            workspaceId,
            if (detection.movementType == "income") "income" else "expense",
            amount,
            suggestionDescription,
            runtimeContext.toString(),
          )
        }
      }
    }
  }

  private fun extractAmount(value: String): String? {
    // Captures amounts in either US format (1,234.56 or 999.99) or European format
    // (1.234,56 or 999,99). Some Peruvian apps use thousands separators on large amounts,
    // including space/NBSP grouping ("S/ 1 234.56") \u2014 without it the regex truncated the
    // match to the first group ("S/ 1").
    // Group 2 = integer part possibly with thousands separators; group 3 = decimal part.
    val regex = Regex("""(?i)(S/|S\.|PEN|US\$|USD|\$)[\s\u00A0]*([0-9]{1,3}(?:[.,\s\u00A0][0-9]{3})*|[0-9]+)(?:([.,])([0-9]{1,2}))?""")
    val match = regex.find(value) ?: return null
    val symbol = match.groupValues[1].uppercase()
    val rawInt = match.groupValues[2]
    val decSep = match.groupValues[3]
    val rawDec = match.groupValues[4]
    val normalized = normalizeAmountString(rawInt, decSep, rawDec) ?: return null
    return when {
      symbol.contains("USD") || symbol.contains("$") -> "USD $normalized"
      else -> "S/ $normalized"
    }
  }

  /**
   * Normalizes a raw amount string with optional thousands separators and decimal separator
   * into a canonical "1234.56" or "1234" form, regardless of whether the source used
   * US (1,234.56) or European (1.234,56) formatting.
   * Returns null if the input is ambiguous or malformed.
   */
  private fun normalizeAmountString(rawInt: String, decSep: String, rawDec: String): String? {
    if (rawInt.isEmpty()) return null
    // Strip thousands separators from the integer part: . , space and NBSP can group.
    // The regex only admits valid 3-digit groups here, so dropping them is safe — the
    // decimal part always arrives separated in decSep/rawDec (mismo contrato que
    // lib/amount-parsing.ts en el lado React).
    val intDigits = rawInt.replace(Regex("""[.,\s\u00A0]"""), "")
    if (intDigits.isEmpty() || !intDigits.all { it.isDigit() }) return null
    val decDigits = if (rawDec.isNotEmpty() && (decSep == "." || decSep == ",")) rawDec else ""
    return if (decDigits.isEmpty()) intDigits else "$intDigits.$decDigits"
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
      "transferencia entre cuentas propias",
      "transferencia entre tus productos",
      "constancia de transferencia",
      "traspaso entre cuentas",
      "traspaso entre tus cuentas",
      "movimiento entre cuentas propias",
      "movimiento entre tus cuentas",
      "transferencia interbancaria a tu propia cuenta",
    )
    val isOwnTransfer = transferSignals.any { normalized.contains(it) } ||
      (normalized.contains("realizaste una transferencia") &&
        (normalized.contains("entre mis cuentas") || normalized.contains("desde tu") ||
          normalized.contains("a tu cuenta") || normalized.contains("entre tus productos")))

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
      "constancia de transferencia",
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
      "constancia de transferencia",
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
      if (!merchant.isNullOrBlank()) return merchant
      if (!bankLabel.isNullOrBlank()) return "Movimiento $bankLabel"
    }
    return listOf(text, bigText, title, subText)
      .firstOrNull { it.isNotBlank() }
      ?.trim()
      ?.take(240)
      ?: "Movimiento detectado"
  }

  private fun extractFinancialEmailMerchant(value: String): String? {
    val searchable = financialEmailTransactionalBody(value)
    val patterns = listOf(
      Regex("""(?i)\bempresa\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})"""),
      Regex("""(?i)\bcomercio\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})"""),
      Regex("""(?i)\bestablecimiento\s*[:\-]?\s*([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})"""),
      Regex("""(?i)\ben\s+([A-Z0-9ÁÉÍÓÚÑ&.'* \-]{3,80})(?:[.,\n\r]|$)"""),
    )
    for (pattern in patterns) {
      val raw = pattern.find(searchable)?.groupValues?.getOrNull(1)?.trim().orEmpty()
      val merchant = cleanFinancialEmailMerchant(raw)
      if (!merchant.isNullOrBlank()) return merchant
    }
    return null
  }

  private fun financialEmailTransactionalBody(value: String): String {
    val cutoffMarkers = listOf(
      "¿no reconoces esta operación?",
      "juntos somos más seguros",
      "juntos somos mas seguros",
      "el bcp nunca te solicitará",
      "el bcp nunca te solicitara",
      "si deseas desafiliarte",
    )
    val normalized = normalizeForMatching(value)
    val markerIndex = cutoffMarkers
      .mapNotNull { marker ->
        val index = normalized.indexOf(normalizeForMatching(marker).trim())
        if (index >= 0) index else null
      }
      .minOrNull()
    return if (markerIndex != null) value.take(markerIndex) else value.take(1400)
  }

  private fun cleanFinancialEmailMerchant(value: String): String? {
    val cleaned = value
        .replace(Regex("""(?i)\s+(monto|datos|operaci[oó]n|fecha|n[uú]mero|por tu seguridad).*$"""), "")
        .replace("*", " ")
        .replace(Regex("""(?i)\b(subscr|subscription|suscripci[oó]n|recurrente|recurring|compra|consumo|pago)\b"""), " ")
        .replace(Regex("""(?i)\b(visa|mastercard|mc|pos|payu|pagoefectivo)\b"""), " ")
        .replace(Regex("""\s+"""), " ")
        .trim(' ', '.', ',', '-', ':', ';')
    val normalized = normalizeForMatching(cleaned)
    if (cleaned.length < 3 || normalized.startsWith(" tu tarjeta")) return null
    val aliases = listOf(
      Regex("""(?i)\b(openai\s+)?chat\s*gpt\b""") to "ChatGPT",
      Regex("""(?i)\bopenai\b""") to "OpenAI",
      Regex("""(?i)\bnetflix\b""") to "Netflix",
      Regex("""(?i)\bspotify\b""") to "Spotify",
      Regex("""(?i)\bapple\b""") to "Apple",
      Regex("""(?i)\bgoogle\b""") to "Google",
      Regex("""(?i)\bamazon\b""") to "Amazon",
    )
    for ((pattern, label) in aliases) {
      if (pattern.containsMatchIn(cleaned)) return label
    }
    return cleaned
      .lowercase()
      .split(" ")
      .filter { it.isNotBlank() }
      .joinToString(" ") { token -> token.replaceFirstChar { char -> char.titlecase() } }
      .take(48)
  }

  private fun financialEmailBankLabel(value: String): String? {
    val normalized = normalizeForMatching(value)
    return when {
      listOf("yape.pe", "yapeapp", "@yape", "yape notificaciones").any { normalized.contains(it) } || (normalized.contains("yape") && (normalized.contains("yapear") || normalized.contains("yapeo") || normalized.contains("yapaste"))) -> "Yape"
      listOf("notificacionesbcp.com.pe", "viabcp", "banco de credito", " bcp ", "bcp notificaciones").any { normalized.contains(it) } || looksLikeBcpTransferEmail(normalized) -> "BCP"
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

  private fun looksLikeBcpTransferEmail(normalized: String): Boolean {
    val hasBcpTransferSubject = normalized.contains("constancia de transferencia entre mis cuentas")
    val hasBcpAccountProduct = listOf(
      "desde tu clasica",
      "desde tu cuenta clasica",
      "cuenta clasica",
    ).any { normalized.contains(it) }
    return hasBcpTransferSubject && (normalized.contains("realizaste una transferencia") || hasBcpAccountProduct)
  }

  private fun normalizeForMatching(value: String): String {
    val noAccents = Normalizer.normalize(value.lowercase(), Normalizer.Form.NFD)
      .replace(Regex("\\p{Mn}+"), "")
    return " ${noAccents.replace(Regex("""[\s\u00A0]+"""), " ")} "
  }

  private val appLabelCache = HashMap<String, String>()

  private fun humanAppLabel(packageName: String): String {
    return when (packageName) {
      "com.bcp.innovacxion.yapeapp" -> "Yape"
      "com.bcp.bank.bcp" -> "BCP"
      "pe.com.interbank.mobilebanking" -> "Interbank"
      "com.bbva.nxt_peru" -> "BBVA"
      "pe.com.scotiabank.blpm.android.client" -> "Scotiabank"
      "pe.com.banbif.mobilebanking" -> "BanBif"
      "pe.gob.bn.bnmasapp" -> "Banco de la Nación"
      "pe.com.mibanco.mibancoapp" -> "Mibanco"
      "pe.com.pichincha.pichinchapp" -> "Banco Pichincha"
      "pe.com.bancofalabella.movil" -> "Banco Falabella"
      "com.bancoripley.bancoripleyapp" -> "Banco Ripley"
      "pe.com.cajaarequipa.app" -> "Caja Arequipa"
      "pe.com.cajahuancayo.app" -> "Caja Huancayo"
      "pe.com.cajacusco.app" -> "Caja Cusco"
      "pe.com.cajasullana.app" -> "Caja Sullana"
      "pe.com.cajatrujillo.app" -> "Caja Trujillo"
      "pe.com.cajapiura.app" -> "Caja Piura"
      "pe.com.interbank.tunki" -> "Tunki"
      "com.google.android.apps.walletnfcrel" -> "Google Wallet"
      GMAIL_PACKAGE -> "Correos bancarios"
      // PackageManager puede tardar (corre en el hilo del listener → riesgo de ANR si está
      // congestionado). Se consulta UNA vez por paquete y se cachea en memoria.
      else -> appLabelCache.getOrPut(packageName) {
        try {
          val appInfo = packageManager.getApplicationInfo(packageName, 0)
          packageManager.getApplicationLabel(appInfo).toString()
        } catch (_: Exception) {
          packageName
        }
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
      "pe.com.banbif.mobilebanking" -> "banbif"
      "pe.gob.bn.bnmasapp" -> "banco_nacion"
      "pe.com.mibanco.mibancoapp" -> "mibanco"
      "pe.com.pichincha.pichinchapp" -> "pichincha"
      "pe.com.bancofalabella.movil" -> "banco_falabella"
      "com.bancoripley.bancoripleyapp" -> "banco_ripley"
      "pe.com.cajaarequipa.app" -> "caja_arequipa"
      "pe.com.cajahuancayo.app" -> "caja_huancayo"
      "pe.com.cajacusco.app" -> "caja_cusco"
      "pe.com.cajasullana.app" -> "caja_sullana"
      "pe.com.cajatrujillo.app" -> "caja_trujillo"
      "pe.com.cajapiura.app" -> "caja_piura"
      "pe.com.interbank.tunki" -> "tunki"
      "com.google.android.apps.walletnfcrel" -> "google_wallet"
      GMAIL_PACKAGE -> "gmail_financial"
      // Previously defaulted to "yape", which mislabeled every unknown package as Yape.
      // Returning "unknown" is safer: the suggestion is still created but downstream
      // (RN side) will know the app was not recognized and can show a generic label.
      else -> "unknown"
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
    // FLAG_ACTIVITY_MULTIPLE_TASK + FLAG_ACTIVITY_NEW_TASK + taskAffinity vacío en el manifest
    // garantiza que esta activity se lance en su propia task, sin traer al frente la task
    // de MainActivity (que es lo que hacía "abrir" visiblemente la app DarkMoney detrás).
    val quickIntent = Intent(this, QuickMovementDialogActivity::class.java)
      .addFlags(
        Intent.FLAG_ACTIVITY_NEW_TASK
          or Intent.FLAG_ACTIVITY_MULTIPLE_TASK
          or Intent.FLAG_ACTIVITY_NO_ANIMATION
          or Intent.FLAG_ACTIVITY_NO_USER_ACTION,
      )
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

    val ignoreIntent = Intent(this, NotificationDetectionActionReceiver::class.java)
      .setAction(NotificationDetectionActionReceiver.ACTION_IGNORE)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_SUGGESTION_ID, suggestionId)
      .putExtra(NotificationDetectionActionReceiver.EXTRA_NOTIFICATION_ID, notificationId)
    val ignorePendingIntent = PendingIntent.getBroadcast(
      this,
      notificationId + 3,
      ignoreIntent,
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
      .addAction(Notification.Action.Builder(0, "Ignorar", ignorePendingIntent).build())
      .addAction(Notification.Action.Builder(0, "No mostrar más", discardPendingIntent).build())
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
    private val RELAY_PACKAGES = setOf(
      "com.google.android.apps.walletnfcrel", // Google Wallet mirrors bank card payments
      "com.samsung.android.spay",             // Samsung Pay mirrors bank card payments
    )
    private var currentService: WeakReference<DarkMoneyNotificationListenerService>? = null

    fun requestActiveScan() {
      currentService?.get()?.processActiveNotifications()
    }

    /**
     * Cancela inmediatamente la notificacion bancaria asociada al sbn.key. Si el listener
     * service no esta bound (app cerrada hace rato), encola la key en SharedPreferences
     * para que el listener la consuma en onListenerConnected y onNotificationPosted.
     */
    fun cancelBankNotificationByKey(context: android.content.Context, key: String) {
      if (key.isBlank()) return
      val service = currentService?.get()
      if (service != null) {
        try {
          service.cancelNotification(key)
          android.util.Log.d("DarkMoneyND", "cancelBankNotificationByKey: cancelled inline key=$key")
          return
        } catch (e: Exception) {
          android.util.Log.d("DarkMoneyND", "cancelBankNotificationByKey: inline cancel failed, queuing key=$key err=${e.message}")
        }
      }
      NotificationDetectionStore.addPendingCancellationKey(context, key)
    }

    fun consumePendingCancellations(service: DarkMoneyNotificationListenerService) {
      val keys = NotificationDetectionStore.takePendingCancellationKeys(service.applicationContext)
      if (keys.isEmpty()) return
      for (key in keys) {
        try {
          service.cancelNotification(key)
          android.util.Log.d("DarkMoneyND", "consumePendingCancellations: cancelled key=$key")
        } catch (e: Exception) {
          android.util.Log.d("DarkMoneyND", "consumePendingCancellations: failed key=$key err=${e.message}")
        }
      }
    }
  }
}
