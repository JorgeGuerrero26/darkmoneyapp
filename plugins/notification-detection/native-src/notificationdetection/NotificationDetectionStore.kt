package com.darkmoney.app.notificationdetection

import android.content.Context
import org.json.JSONArray
import org.json.JSONObject
import java.security.MessageDigest
import java.text.Normalizer

object NotificationDetectionStore {
  private const val PREFS = "darkmoney_notification_detection"
  private const val KEY_ENABLED = "enabled"
  private const val KEY_ALLOWED_PACKAGES = "allowed_packages"
  private const val KEY_SUGGESTIONS = "suggestions_json"
  private const val KEY_RUNTIME_CONTEXT = "runtime_context_json"
  private const val KEY_DISCARD_FINGERPRINTS = "discard_fingerprints_v1"
  private const val KEY_DISCARD_FINGERPRINTS_V2 = "discard_fingerprints_v2"
  private const val KEY_LAST_SAVE_ERROR = "last_save_error_json"
  private const val KEY_PENDING_CANCEL_KEYS = "pending_cancel_keys_v1"
  private const val MAX_PENDING_CANCEL_KEYS = 50

  // Pruning configuration.
  private const val MAX_SUGGESTIONS = 200
  private const val MAX_SUGGESTION_AGE_MS = 30L * 24 * 60 * 60 * 1000 // 30 days
  private const val MAX_DISCARD_FINGERPRINTS = 500
  private const val MAX_DISCARD_FINGERPRINT_AGE_MS = 60L * 24 * 60 * 60 * 1000 // 60 days
  private const val DISCARD_FINGERPRINT_TRIM_BATCH = 50

  val defaultAllowedPackages = setOf(
    "com.bcp.innovacxion.yapeapp",
    "pe.com.interbank.mobilebanking",
    "com.bbva.nxt_peru",
    "pe.com.scotiabank.blpm.android.client",
    "com.google.android.apps.walletnfcrel",
  )

  fun isEnabled(context: Context): Boolean {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getBoolean(KEY_ENABLED, false)
  }

  fun setEnabled(context: Context, enabled: Boolean) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putBoolean(KEY_ENABLED, enabled)
      .apply()
  }

  fun getAllowedPackages(context: Context): Set<String> {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getStringSet(KEY_ALLOWED_PACKAGES, defaultAllowedPackages)
      ?.filter { it.isNotBlank() }
      ?.map { it.trim() }
      ?.toSet()
      ?: defaultAllowedPackages
  }

  fun setAllowedPackages(context: Context, packages: Set<String>) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putStringSet(KEY_ALLOWED_PACKAGES, packages.filter { it.isNotBlank() }.map { it.trim() }.toSet())
      .apply()
  }

  fun isAllowedPackage(context: Context, packageName: String): Boolean {
    return getAllowedPackages(context).contains(packageName)
  }

  fun createSuggestionId(packageName: String, notificationKey: String, text: String, amountLabel: String): String {
    return sha256("$packageName|$notificationKey|$amountLabel|${text.take(180)}").take(24)
  }

  fun upsertSuggestion(context: Context, suggestion: JSONObject): Boolean {
    val suggestions = readSuggestionsArray(context)
    val id = suggestion.optString("id")
    var replaced = false
    var wasPending = false

    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == id) {
        val status = current.optString("status", "pending")
        wasPending = status == "pending"
        suggestion.put("status", status)
        suggestions.put(index, suggestion)
        replaced = true
        break
      }
    }

    if (!replaced) suggestions.put(suggestion)
    writeSuggestionsArray(context, suggestions)
    return !replaced || wasPending
  }

  /**
   * Marca un suggestion como "registrando" de forma atómica. Retorna true si la marca se aplicó
   * (el caller es el dueño del flujo de guardado), o false si ya estaba en curso (otro flujo
   * ya lo tomó — el caller debe abortar). Previene dobles inserts cuando el usuario toca
   * "Registro rápido" y el cuerpo de la notif en rápida sucesión, o cuando un re-disparo del
   * bridge re-arranca el headless task con el mismo suggestionId.
   *
   * El timestamp permite expirar la marca si el headless task se cuelga (>60s) sin completar.
   */
  @Synchronized
  fun tryClaimRegistration(context: Context, suggestionId: String, withinMs: Long = 60_000L): Boolean {
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") != suggestionId) continue
      val status = current.optString("status", "pending")
      if (status == "registered" || status == "discarded") return false
      val claimedAt = current.optLong("registrationClaimedAt", 0L)
      val now = System.currentTimeMillis()
      if (claimedAt > 0L && (now - claimedAt) < withinMs) return false
      current.put("registrationClaimedAt", now)
      current.put("updatedAt", now)
      suggestions.put(index, current)
      writeSuggestionsArray(context, suggestions)
      return true
    }
    return false
  }

  fun releaseRegistrationClaim(context: Context, suggestionId: String) {
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") != suggestionId) continue
      if (current.has("registrationClaimedAt")) {
        current.remove("registrationClaimedAt")
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        writeSuggestionsArray(context, suggestions)
      }
      return
    }
  }

  fun markStatus(context: Context, suggestionId: String, status: String) {
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        current.put("status", status)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun setAiCategoryRecommendation(context: Context, suggestionId: String, recommendationJson: String) {
    val recommendation = try {
      if (recommendationJson.isBlank() || recommendationJson == "null") null else JSONObject(recommendationJson)
    } catch (_: Exception) {
      null
    }
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        if (recommendation == null) current.remove("aiCategoryRecommendation") else current.put("aiCategoryRecommendation", recommendation)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun setDescriptionCleanup(context: Context, suggestionId: String, cleanupJson: String) {
    val cleanup = try {
      if (cleanupJson.isBlank() || cleanupJson == "null") null else JSONObject(cleanupJson)
    } catch (_: Exception) {
      null
    }
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        if (cleanup == null) current.remove("descriptionCleanup") else current.put("descriptionCleanup", cleanup)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun setCounterpartyRecommendation(context: Context, suggestionId: String, recommendationJson: String) {
    val recommendation = try {
      if (recommendationJson.isBlank() || recommendationJson == "null") null else JSONObject(recommendationJson)
    } catch (_: Exception) {
      null
    }
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        if (recommendation == null) current.remove("counterpartyRecommendation") else current.put("counterpartyRecommendation", recommendation)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun setRecurringRecommendation(context: Context, suggestionId: String, recommendationJson: String) {
    val recommendation = try {
      if (recommendationJson.isBlank() || recommendationJson == "null") null else JSONObject(recommendationJson)
    } catch (_: Exception) {
      null
    }
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        if (recommendation == null) current.remove("recurringRecommendation") else current.put("recurringRecommendation", recommendation)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun setRiskExplanation(context: Context, suggestionId: String, explanationJson: String) {
    val explanation = try {
      if (explanationJson.isBlank() || explanationJson == "null") null else JSONObject(explanationJson)
    } catch (_: Exception) {
      null
    }
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        if (explanation == null) current.remove("riskExplanation") else current.put("riskExplanation", explanation)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun setBudgetImpact(context: Context, suggestionId: String, impactJson: String) {
    val impact = try {
      if (impactJson.isBlank() || impactJson == "null") null else JSONObject(impactJson)
    } catch (_: Exception) {
      null
    }
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) {
        if (impact == null) current.remove("budgetImpact") else current.put("budgetImpact", impact)
        current.put("updatedAt", System.currentTimeMillis())
        suggestions.put(index, current)
        break
      }
    }
    writeSuggestionsArray(context, suggestions)
  }

  fun getSuggestions(context: Context): JSONArray {
    return readSuggestionsArray(context)
  }

  fun getSuggestion(context: Context, suggestionId: String): JSONObject? {
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val current = suggestions.optJSONObject(index) ?: continue
      if (current.optString("id") == suggestionId) return current
    }
    return null
  }

  fun setRuntimeContext(context: Context, contextJson: String) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_RUNTIME_CONTEXT, contextJson)
      .apply()
  }

  fun getRuntimeContext(context: Context): JSONObject {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_RUNTIME_CONTEXT, "{}")
    return try {
      JSONObject(raw ?: "{}")
    } catch (_: Exception) {
      JSONObject()
    }
  }

  fun setLastSaveError(context: Context, suggestionId: String, message: String) {
    val payload = JSONObject().apply {
      put("suggestionId", suggestionId)
      put("message", message)
      put("ts", System.currentTimeMillis())
    }
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_LAST_SAVE_ERROR, payload.toString())
      .apply()
  }

  fun getLastSaveError(context: Context): JSONObject? {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_LAST_SAVE_ERROR, null) ?: return null
    return try {
      JSONObject(raw)
    } catch (_: Exception) {
      null
    }
  }

  fun clearLastSaveError(context: Context) {
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .remove(KEY_LAST_SAVE_ERROR)
      .apply()
  }

  @Synchronized
  fun addPendingCancellationKey(context: Context, key: String) {
    if (key.isBlank()) return
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val existing = prefs.getStringSet(KEY_PENDING_CANCEL_KEYS, emptySet()) ?: emptySet()
    if (existing.contains(key)) return
    val combined = existing.toMutableSet()
    combined.add(key)
    // Cap to avoid unbounded growth if the listener never re-binds.
    val capped = if (combined.size > MAX_PENDING_CANCEL_KEYS) {
      combined.toList().takeLast(MAX_PENDING_CANCEL_KEYS).toSet()
    } else combined
    prefs.edit().putStringSet(KEY_PENDING_CANCEL_KEYS, capped).apply()
  }

  @Synchronized
  fun takePendingCancellationKeys(context: Context): Set<String> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val existing = prefs.getStringSet(KEY_PENDING_CANCEL_KEYS, emptySet()) ?: emptySet()
    if (existing.isEmpty()) return emptySet()
    prefs.edit().remove(KEY_PENDING_CANCEL_KEYS).apply()
    return existing
  }

  fun removePendingSuggestions(context: Context) {
    val suggestions = readSuggestionsArray(context)
    val kept = JSONArray()
    for (i in 0 until suggestions.length()) {
      val s = suggestions.optJSONObject(i) ?: continue
      if (s.optString("status") != "pending") kept.put(s)
    }
    writeSuggestionsArray(context, kept)
  }

  private fun readSuggestionsArray(context: Context): JSONArray {
    val raw = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getString(KEY_SUGGESTIONS, "[]")
    return try {
      JSONArray(raw)
    } catch (_: Exception) {
      JSONArray()
    }
  }

  private fun writeSuggestionsArray(context: Context, suggestions: JSONArray) {
    val pruned = pruneSuggestionsArray(suggestions)
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SUGGESTIONS, pruned.toString())
      .apply()
  }

  /**
   * Removes suggestions older than MAX_SUGGESTION_AGE_MS and enforces a hard cap of MAX_SUGGESTIONS.
   * Pending suggestions are always kept regardless of age (user must explicitly resolve them).
   * Older non-pending suggestions are dropped first when over the cap.
   */
  private fun pruneSuggestionsArray(suggestions: JSONArray): JSONArray {
    val now = System.currentTimeMillis()
    val cutoff = now - MAX_SUGGESTION_AGE_MS
    val items = ArrayList<JSONObject>(suggestions.length())
    for (i in 0 until suggestions.length()) {
      val item = suggestions.optJSONObject(i) ?: continue
      val status = item.optString("status", "pending")
      val updatedAt = item.optLong("updatedAt", item.optLong("createdAt", now))
      if (status != "pending" && updatedAt < cutoff) continue
      items.add(item)
    }
    if (items.size > MAX_SUGGESTIONS) {
      // Sort by (pending first, then by updatedAt desc) and trim.
      items.sortWith(compareByDescending<JSONObject> { it.optString("status", "pending") == "pending" }
        .thenByDescending { it.optLong("updatedAt", it.optLong("createdAt", 0L)) })
      while (items.size > MAX_SUGGESTIONS) items.removeAt(items.size - 1)
    }
    val out = JSONArray()
    for (item in items) out.put(item)
    return out
  }

  /** Force a prune pass (e.g., on listener connect). Safe to call frequently. */
  fun pruneSuggestions(context: Context) {
    val suggestions = readSuggestionsArray(context)
    writeSuggestionsArray(context, suggestions)
  }

  fun computeDiscardFingerprint(packageName: String, content: String): String {
    val normalized = Normalizer.normalize(content.lowercase(), Normalizer.Form.NFD)
      .replace(Regex("\\p{Mn}+"), "")
      .replace(Regex("[0-9]+"), "")
      .replace(Regex("\\s+"), " ")
      .trim()
      .take(120)
    return sha256("$packageName|$normalized")
  }

  fun addDiscardFingerprint(context: Context, fingerprint: String) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val now = System.currentTimeMillis()
    val entries = readDiscardFingerprints(context).toMutableList()
    // Remove any existing entry with the same fingerprint so we can bump its timestamp.
    val existingIndex = entries.indexOfFirst { it.optString("fp") == fingerprint }
    if (existingIndex >= 0) entries.removeAt(existingIndex)
    entries.add(JSONObject().put("fp", fingerprint).put("ts", now))
    // Drop expired entries.
    val cutoff = now - MAX_DISCARD_FINGERPRINT_AGE_MS
    entries.removeAll { it.optLong("ts", 0L) < cutoff }
    // FIFO rotation: drop oldest in batches when over the cap.
    if (entries.size > MAX_DISCARD_FINGERPRINTS) {
      entries.sortBy { it.optLong("ts", 0L) }
      val target = MAX_DISCARD_FINGERPRINTS - DISCARD_FINGERPRINT_TRIM_BATCH
      while (entries.size > target && entries.isNotEmpty()) entries.removeAt(0)
    }
    val out = JSONArray()
    for (entry in entries) out.put(entry)
    prefs.edit()
      .putString(KEY_DISCARD_FINGERPRINTS_V2, out.toString())
      .remove(KEY_DISCARD_FINGERPRINTS)
      .apply()
  }

  fun isDiscardedFingerprint(context: Context, fingerprint: String): Boolean {
    val entries = readDiscardFingerprints(context)
    for (entry in entries) {
      if (entry.optString("fp") == fingerprint) return true
    }
    return false
  }

  /**
   * Borra todas las huellas de descarte. Se invoca en el cleanup por cambio de notifCleanupKey
   * para purgar huellas genéricas (sin monto) que versiones anteriores guardaban al registrar y
   * que bloqueaban futuras transacciones de la misma plantilla bancaria.
   */
  fun clearDiscardFingerprints(context: Context) {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    prefs.edit()
      .remove(KEY_DISCARD_FINGERPRINTS_V2)
      .remove(KEY_DISCARD_FINGERPRINTS)
      .apply()
  }

  /**
   * Reads v2 fingerprints (JSON array with timestamps) and migrates the legacy v1 StringSet on first read.
   * Migration assigns timestamp 0 to legacy entries so they age out naturally.
   */
  private fun readDiscardFingerprints(context: Context): List<JSONObject> {
    val prefs = context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
    val v2Raw = prefs.getString(KEY_DISCARD_FINGERPRINTS_V2, null)
    if (v2Raw != null) {
      return try {
        val array = JSONArray(v2Raw)
        val list = ArrayList<JSONObject>(array.length())
        for (i in 0 until array.length()) array.optJSONObject(i)?.let { list.add(it) }
        list
      } catch (_: Exception) {
        emptyList()
      }
    }
    // Migrate legacy StringSet to v2 with timestamp 0 (oldest).
    val legacy = prefs.getStringSet(KEY_DISCARD_FINGERPRINTS, emptySet()) ?: emptySet()
    if (legacy.isEmpty()) return emptyList()
    val migrated = ArrayList<JSONObject>(legacy.size)
    for (fp in legacy) {
      if (fp.isBlank()) continue
      migrated.add(JSONObject().put("fp", fp).put("ts", 0L))
    }
    val out = JSONArray()
    for (entry in migrated) out.put(entry)
    prefs.edit()
      .putString(KEY_DISCARD_FINGERPRINTS_V2, out.toString())
      .remove(KEY_DISCARD_FINGERPRINTS)
      .apply()
    return migrated
  }

  fun hasPendingSuggestionForAmount(context: Context, amountLabel: String, withinMs: Long): Boolean {
    val since = System.currentTimeMillis() - withinMs
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val s = suggestions.optJSONObject(index) ?: continue
      if (s.optString("status") == "pending"
          && s.optString("amountLabel") == amountLabel
          && s.optLong("createdAt", 0L) >= since) return true
    }
    return false
  }

  /**
   * ¿Ya hay una sugerencia REGISTRADA RECIENTE que sea exactamente la MISMA transacción que
   * está re-llegando (misma huella + mismo monto, registrada hace < withinMs)?
   *
   * IMPORTANTE: `discardFingerprint` NO incluye el monto (computeDiscardFingerprint borra los
   * dígitos a propósito, para que "descartar" suprima futuras notificaciones de plantilla
   * similar). Por eso aquí EXIGIMOS también `amountLabel` y una ventana temporal corta: así solo
   * suprimimos el re-disparo de la transacción que se acaba de registrar (notif. vieja aún en
   * bandeja al reabrir), y NUNCA una compra nueva del mismo banco con otro monto, ni una del
   * mismo monto registrada hace tiempo.
   */
  fun hasRecentRegisteredSuggestion(
    context: Context,
    fingerprint: String,
    amountLabel: String,
    withinMs: Long,
  ): Boolean {
    if (fingerprint.isBlank() || amountLabel.isBlank()) return false
    val since = System.currentTimeMillis() - withinMs
    val suggestions = readSuggestionsArray(context)
    for (index in 0 until suggestions.length()) {
      val s = suggestions.optJSONObject(index) ?: continue
      if (s.optString("status") != "registered") continue
      if (s.optString("discardFingerprint") != fingerprint) continue
      if (s.optString("amountLabel") != amountLabel) continue
      // updatedAt se setea al marcar registered; createdAt como respaldo.
      val ts = s.optLong("updatedAt", s.optLong("createdAt", 0L))
      if (ts >= since) return true
    }
    return false
  }

  private fun sha256(value: String): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
    return bytes.joinToString("") { "%02x".format(it) }
  }
}
