package com.darkmoney.app.notificationdetection

/**
 * Parsing de montos de notificaciones bancarias (Yape, BCP, Interbank, Gmail, etc.).
 * Kotlin puro, sin dependencias de Android: extraído tal cual de
 * DarkMoneyNotificationListenerService para poder cubrirlo con tests JUnit
 * (auditoría, hallazgos N6/N14) — las regex se rompían en silencio con formatos nuevos.
 */
object AmountParsing {

  fun extractAmount(value: String): String? {
    // Captures amounts in either US format (1,234.56 or 999.99) or European format
    // (1.234,56 or 999,99). Some Peruvian apps use thousands separators on large amounts,
    // including space/NBSP grouping ("S/ 1 234.56") — without it the regex truncated the
    // match to the first group ("S/ 1").
    // Group 2 = integer part possibly with thousands separators; group 3 = decimal part.
    val regex = Regex("""(?i)(S/|S\.|PEN|US\$|USD|\$)[\s ]*([0-9]{1,3}(?:[.,\s ][0-9]{3})*|[0-9]+)(?:([.,])([0-9]{1,2}))?""")
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
  fun normalizeAmountString(rawInt: String, decSep: String, rawDec: String): String? {
    if (rawInt.isEmpty()) return null
    // Strip thousands separators from the integer part: . , space and NBSP can group.
    // The regex only admits valid 3-digit groups here, so dropping them is safe — the
    // decimal part always arrives separated in decSep/rawDec (mismo contrato que
    // lib/amount-parsing.ts en el lado React).
    val intDigits = rawInt.replace(Regex("""[.,\s ]"""), "")
    if (intDigits.isEmpty() || !intDigits.all { it.isDigit() }) return null
    val decDigits = if (rawDec.isNotEmpty() && (decSep == "." || decSep == ",")) rawDec else ""
    return if (decDigits.isEmpty()) intDigits else "$intDigits.$decDigits"
  }
}
