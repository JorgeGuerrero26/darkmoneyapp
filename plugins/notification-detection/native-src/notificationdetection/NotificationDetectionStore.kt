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
    context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .edit()
      .putString(KEY_SUGGESTIONS, suggestions.toString())
      .apply()
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
    val current = prefs.getStringSet(KEY_DISCARD_FINGERPRINTS, emptySet())?.toMutableSet() ?: mutableSetOf()
    if (current.size >= 500) return
    current.add(fingerprint)
    prefs.edit().putStringSet(KEY_DISCARD_FINGERPRINTS, current).apply()
  }

  fun isDiscardedFingerprint(context: Context, fingerprint: String): Boolean {
    return context.getSharedPreferences(PREFS, Context.MODE_PRIVATE)
      .getStringSet(KEY_DISCARD_FINGERPRINTS, emptySet())
      ?.contains(fingerprint) == true
  }

  private fun sha256(value: String): String {
    val bytes = MessageDigest.getInstance("SHA-256").digest(value.toByteArray())
    return bytes.joinToString("") { "%02x".format(it) }
  }
}
