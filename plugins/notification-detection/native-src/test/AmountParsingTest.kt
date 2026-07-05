package com.darkmoney.app.notificationdetection

import org.junit.Assert.assertEquals
import org.junit.Assert.assertNull
import org.junit.Test

/**
 * Tests de AmountParsing con fixtures reales de notificaciones peruanas (Yape, BCP,
 * Interbank, Gmail). Fuente editable: plugins/notification-detection/native-src/test/;
 * el config plugin la sincroniza a android/app/src/test/java/.../notificationdetection/.
 * Correr con: cd android && .\gradlew.bat :app:testReleaseUnitTest --tests "*AmountParsing*"
 */
class AmountParsingTest {

  // ── Formatos básicos ──────────────────────────────────────────────────────

  @Test fun yapeSimpleAmount() {
    assertEquals("S/ 67.00", AmountParsing.extractAmount("Confirmación de Pago Yape! Has pagado S/ 67.00 a Maria"))
  }

  @Test fun yapeSingleDecimal() {
    assertEquals("S/ 67.0", AmountParsing.extractAmount("Yapeaste S/ 67.0"))
  }

  @Test fun amountWithoutDecimals() {
    assertEquals("S/ 50", AmountParsing.extractAmount("Pagaste S/ 50 en Metro"))
  }

  @Test fun sDotPrefix() {
    assertEquals("S/ 120.00", AmountParsing.extractAmount("Compra por S. 120.00 con tu tarjeta"))
  }

  @Test fun penPrefix() {
    assertEquals("S/ 35.90", AmountParsing.extractAmount("Cargo de PEN 35.90 en tu cuenta"))
  }

  // ── USD ───────────────────────────────────────────────────────────────────

  @Test fun usdWithSymbol() {
    assertEquals("USD 99.99", AmountParsing.extractAmount("Consumo de US$ 99.99 en Amazon"))
  }

  @Test fun usdWord() {
    assertEquals("USD 15.00", AmountParsing.extractAmount("Pago de USD 15.00 aprobado"))
  }

  @Test fun dollarSignAlone() {
    assertEquals("USD 20.50", AmountParsing.extractAmount("Compra $ 20.50 aprobada"))
  }

  // ── Separadores de miles ──────────────────────────────────────────────────

  @Test fun usFormatThousands() {
    assertEquals("S/ 1234.56", AmountParsing.extractAmount("Transferiste S/ 1,234.56 a tu cuenta"))
  }

  @Test fun europeanFormatThousands() {
    assertEquals("S/ 1234.56", AmountParsing.extractAmount("Transferiste S/ 1.234,56 a tu cuenta"))
  }

  @Test fun spaceGroupedThousands() {
    assertEquals("S/ 1234.56", AmountParsing.extractAmount("Pagaste S/ 1 234.56 en Saga"))
  }

  @Test fun millionsUsFormat() {
    assertEquals("S/ 1234567.89", AmountParsing.extractAmount("Saldo S/ 1,234,567.89"))
  }

  // ── Sin monto / malformados ───────────────────────────────────────────────

  @Test fun noAmountReturnsNull() {
    assertNull(AmountParsing.extractAmount("Tu clave dinámica es 123456"))
  }

  @Test fun currencyWithoutNumberReturnsNull() {
    assertNull(AmountParsing.extractAmount("Consulta tu saldo en S/ desde la app"))
  }

  @Test fun plainNumberWithoutCurrencyReturnsNull() {
    assertNull(AmountParsing.extractAmount("Recibiste 45.00 puntos"))
  }

  // ── Primer monto del texto (montos múltiples) ─────────────────────────────

  @Test fun firstAmountWins() {
    assertEquals("S/ 25.00", AmountParsing.extractAmount("Pagaste S/ 25.00. Tu saldo es S/ 980.10"))
  }

  // ── normalizeAmountString directo ─────────────────────────────────────────

  @Test fun normalizeStripsThousandsSeparators() {
    assertEquals("1234", AmountParsing.normalizeAmountString("1,234", "", ""))
    assertEquals("1234.5", AmountParsing.normalizeAmountString("1.234", ",", "5"))
  }

  @Test fun normalizeRejectsEmpty() {
    assertNull(AmountParsing.normalizeAmountString("", ".", "50"))
  }

  @Test fun normalizeIgnoresDecimalsWithoutSeparator() {
    assertEquals("1234", AmountParsing.normalizeAmountString("1234", "", "56"))
  }
}
