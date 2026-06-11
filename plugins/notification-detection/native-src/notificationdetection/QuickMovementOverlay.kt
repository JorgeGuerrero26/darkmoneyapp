package com.darkmoney.app.notificationdetection

import android.animation.ValueAnimator
import android.app.NotificationManager
import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.Editable
import android.text.InputType
import android.text.TextWatcher
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
import android.view.animation.AccelerateDecelerateInterpolator
import android.view.animation.DecelerateInterpolator
import android.view.animation.OvershootInterpolator
import android.widget.EditText
import android.widget.FrameLayout
import android.widget.HorizontalScrollView
import android.widget.ImageView
import android.widget.LinearLayout
import android.widget.ProgressBar
import android.widget.ScrollView
import android.widget.TextView
import com.darkmoney.app.R
import org.json.JSONObject
import java.text.Normalizer
import java.util.Locale

object QuickMovementOverlay {
  private var overlayView: View? = null
  private var panelView: View? = null
  private var windowManager: WindowManager? = null
  private var isDismissing = false

  fun show(context: Context, suggestionId: String, notificationId: Int) {
    dismiss()

    val appContext = context.applicationContext
    val manager = appContext.getSystemService(WindowManager::class.java)
    val suggestion = NotificationDetectionStore.getSuggestion(appContext, suggestionId)
    val appName = suggestion?.optString("appName").orEmpty().ifBlank { "App financiera" }
    val financialAppKey = suggestion?.optString("financialAppKey").orEmpty()
    val amountLabel = suggestion?.optString("amountLabel").orEmpty()
    val amount = amountLabel.replace(Regex("[^0-9.,]"), "")
    val description = suggestion?.optString("text").orEmpty().ifBlank {
      suggestion?.optString("title").orEmpty()
    }
    val movementType = suggestion?.optString("movementType").orEmpty()
    val aiCategoryRecommendation = suggestion?.optJSONObject("aiCategoryRecommendation")
    val descriptionCleanup = suggestion?.optJSONObject("descriptionCleanup")
    val counterpartyRecommendation = suggestion?.optJSONObject("counterpartyRecommendation")
    val recurringRecommendation = suggestion?.optJSONObject("recurringRecommendation")
    val riskExplanation = suggestion?.optJSONObject("riskExplanation")
    val budgetImpact = suggestion?.optJSONObject("budgetImpact")

    val runtimeContext = NotificationDetectionStore.getRuntimeContext(appContext)
    val view = buildOverlay(appContext, suggestionId, notificationId, appName, financialAppKey, amountLabel, amount, description, movementType, runtimeContext, aiCategoryRecommendation, descriptionCleanup, counterpartyRecommendation, recurringRecommendation, riskExplanation, budgetImpact)

    val type = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY
    } else {
      @Suppress("DEPRECATION")
      WindowManager.LayoutParams.TYPE_PHONE
    }
    val params = WindowManager.LayoutParams(
      WindowManager.LayoutParams.MATCH_PARENT,
      WindowManager.LayoutParams.MATCH_PARENT,
      type,
      WindowManager.LayoutParams.FLAG_LAYOUT_IN_SCREEN,
      PixelFormat.TRANSLUCENT,
    ).apply {
      gravity = Gravity.CENTER
      windowAnimations = 0
    }

    windowManager = manager
    isDismissing = false
    // Delay so the notification shade has time to close before the overlay appears.
    // Check windowManager is still set (not cleared by a dismiss() call during the delay).
    Handler(Looper.getMainLooper()).postDelayed({
      if (windowManager == null) return@postDelayed
      try {
        manager.addView(view, params)
        overlayView = view
      } catch (_: Exception) {
        dismiss()
      }
    }, 350)
  }

  fun dismiss() {
    val manager = windowManager
    windowManager = null
    val view = overlayView ?: return
    overlayView = null
    panelView = null
    isDismissing = false
    try {
      manager?.removeViewImmediate(view)
    } catch (_: Exception) {
      // The view may already be detached if Android removed the overlay.
    }
    QuickMovementDialogActivity.finishLauncher()
  }

  private fun animatedDismiss() {
    if (isDismissing) return
    val backdrop = overlayView ?: run { dismiss(); return }
    val panel = panelView ?: run { dismiss(); return }
    isDismissing = true
    val density = panel.resources.displayMetrics.density
    backdrop.animate()
      .alpha(0f)
      .setDuration(240)
      .setInterpolator(DecelerateInterpolator())
      .start()
    panel.animate()
      .translationY(72 * density)
      .alpha(0f)
      .scaleX(0.93f)
      .scaleY(0.93f)
      .setDuration(240)
      .setInterpolator(DecelerateInterpolator())
      .withEndAction { dismiss() }
      .start()
  }

  private fun animateIn(backdrop: View, panel: View) {
    val density = panel.resources.displayMetrics.density
    backdrop.alpha = 0f
    panel.alpha = 0f
    panel.translationY = 96 * density
    panel.scaleX = 0.90f
    panel.scaleY = 0.90f
    backdrop.animate()
      .alpha(1f)
      .setDuration(320)
      .setInterpolator(DecelerateInterpolator())
      .start()
    panel.animate()
      .translationY(0f)
      .alpha(1f)
      .scaleX(1f)
      .scaleY(1f)
      .setDuration(420)
      .setInterpolator(OvershootInterpolator(0.55f))
      .start()
  }

  private fun buildOverlay(
    context: Context,
    suggestionId: String,
    notificationId: Int,
    appName: String,
    financialAppKey: String,
    amountLabel: String,
    amount: String,
    description: String,
    movementType: String,
    runtimeContext: JSONObject,
    aiCategoryRecommendation: JSONObject?,
    descriptionCleanup: JSONObject?,
    counterpartyRecommendation: JSONObject?,
    recurringRecommendation: JSONObject?,
    riskExplanation: JSONObject?,
    budgetImpact: JSONObject?,
  ): View {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()
    val detectedCurrencyCode = currencyFromAmountLabel(amountLabel)
    val detectedAmount = parseAmount(amount)
    val workspaceBaseCurrencyCode = runtimeContext.optString("workspaceBaseCurrencyCode").ifBlank { "PEN" }.uppercase()

    val backdrop = FrameLayout(context).apply {
      setBackgroundColor(0xB3000000.toInt())
      setOnClickListener { animatedDismiss() }
    }

    val root = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(18), dp(18), dp(18), dp(16))
      background = roundedBg(0xFF090D12.toInt(), dp(28), 0x26FFFFFF, dp(1))
      elevation = dp(18).toFloat()
      isClickable = true
    }

    val header = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
    }
    header.addView(ImageView(context).apply {
      try {
        setImageResource(R.drawable.logo_darkmoney)
      } catch (_: Exception) {
        setImageResource(R.mipmap.ic_launcher_foreground)
      }
      scaleType = ImageView.ScaleType.CENTER_INSIDE
      setPadding(dp(6), dp(6), dp(6), dp(6))
      background = roundedBg(0x1A6BE4C5.toInt(), dp(14))
    }, LinearLayout.LayoutParams(dp(40), dp(40)))
    header.addView(LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(12), 0, 0, 0)
      addView(TextView(context).apply {
        text = "Registrar movimiento"
        textSize = 19f
        setTextColor(0xFFF5F7FB.toInt())
        typeface = Typeface.DEFAULT_BOLD
      })
      addView(TextView(context).apply {
        text = "Detectado desde $appName"
        textSize = 12f
        setTextColor(0xFF96A2B5.toInt())
      })
    }, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    header.addView(TextView(context).apply {
      text = "×"
      textSize = 26f
      gravity = Gravity.CENTER
      setTextColor(0xFF96A2B5.toInt())
      background = roundedBg(0x12FFFFFF, dp(16), 0x14FFFFFF, dp(1))
      setOnClickListener { animatedDismiss() }
    }, LinearLayout.LayoutParams(dp(36), dp(36)))
    root.addView(header)

    val amountCard = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(14), dp(12), dp(14), dp(12))
      background = roundedBg(0xFF0F141B.toInt(), dp(20), 0x1FFFFFFF, dp(1))
    }
    amountCard.addView(TextView(context).apply {
      text = "Monto detectado"
      textSize = 11f
      setTextColor(0xFF96A2B5.toInt())
      typeface = Typeface.DEFAULT_BOLD
    })
    val amountInput = EditText(context).apply {
      setText(amount)
      inputType = InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL
      textSize = 30f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(0xFFF5F7FB.toInt())
      setHintTextColor(0xFF96A2B5.toInt())
      setSingleLine(true)
      setPadding(0, dp(2), 0, 0)
      background = null
      contentDescription = "Monto detectado en $detectedCurrencyCode"
    }
    amountCard.addView(amountInput)
    val amountMetaText = TextView(context).apply {
      text = detectedCurrencyCode
      textSize = 11f
      setTextColor(0xFF96A2B5.toInt())
      setPadding(0, dp(2), 0, 0)
    }
    amountCard.addView(amountMetaText)
    root.addView(amountCard, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(16) })

    var selectedType = when (movementType) {
      "income" -> "income"
      "transfer" -> "transfer"
      else -> "expense"
    }
    val transferOnlyViews = mutableListOf<View>()
    val expenseIncomeOnlyViews = mutableListOf<View>()
    var categorySelect: SelectRefs? = null
    // Ajusta el origen al cambiar de tipo: en transferencia el origen debe honrar el par
    // frecuente (p. ej. Sueldo→Principal), no el default por moneda (que resolvía a Principal).
    // Se asigna después de crear los selects de cuenta (necesita `accounts`); puede ser null
    // hasta entonces, pero los toggles solo ocurren tras construir el overlay.
    var syncAccountsForType: (() -> Unit)? = null
    fun applyTypeVisibility() {
      val isTransfer = selectedType == "transfer"
      transferOnlyViews.forEach { it.visibility = if (isTransfer) View.VISIBLE else View.GONE }
      expenseIncomeOnlyViews.forEach { it.visibility = if (isTransfer) View.GONE else View.VISIBLE }
    }
    val segment = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(4), dp(4), dp(4), dp(4))
      background = roundedBg(0xFF161F2A.toInt(), dp(18), 0x1AFFFFFF, dp(1))
    }
    lateinit var expenseSegment: TextView
    lateinit var incomeSegment: TextView
    lateinit var transferSegment: TextView
    fun refreshSegments() {
      styleSegment(expenseSegment, selectedType == "expense", 0xFFFF8F9E.toInt(), dp(14))
      styleSegment(incomeSegment, selectedType == "income", 0xFF6BE4C5.toInt(), dp(14))
      styleSegment(transferSegment, selectedType == "transfer", 0xFF8EA5FF.toInt(), dp(14))
      applyTypeVisibility()
      syncAccountsForType?.invoke()
      categorySelect?.refresh()
    }
    expenseSegment = TextView(context).apply {
      text = "Gasto"
      gravity = Gravity.CENTER
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      contentDescription = "Tipo de movimiento: gasto"
      setOnClickListener {
        selectedType = "expense"
        refreshSegments()
      }
    }
    incomeSegment = TextView(context).apply {
      text = "Ingreso"
      gravity = Gravity.CENTER
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      contentDescription = "Tipo de movimiento: ingreso"
      setOnClickListener {
        selectedType = "income"
        refreshSegments()
      }
    }
    transferSegment = TextView(context).apply {
      text = "Transferencia"
      gravity = Gravity.CENTER
      textSize = 13f
      typeface = Typeface.DEFAULT_BOLD
      contentDescription = "Tipo de movimiento: transferencia entre cuentas"
      setOnClickListener {
        selectedType = "transfer"
        refreshSegments()
      }
    }
    segment.addView(expenseSegment, LinearLayout.LayoutParams(0, dp(42), 1f))
    segment.addView(incomeSegment, LinearLayout.LayoutParams(0, dp(42), 1f))
    segment.addView(transferSegment, LinearLayout.LayoutParams(0, dp(42), 1.25f))
    root.addView(segment, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(12) })

    val accounts = sortAccountsForDetectedCurrency(
      readOptions(runtimeContext, "accounts", fallbackLabel = "Sin cuenta asignada", metaKey = "currencyCode"),
      detectedCurrencyCode,
    )
    fun refreshAmountForAccount(index: Int) {
      val accountCurrency = accounts.getOrNull(index)?.meta?.uppercase().orEmpty().ifBlank { detectedCurrencyCode }
      val conversion = convertAmount(detectedAmount, detectedCurrencyCode, accountCurrency, runtimeContext, workspaceBaseCurrencyCode)
      amountInput.setText(formatAmount(conversion.amount))
      amountMetaText.text = when {
        conversion.converted ->
          "${conversion.currencyCode} · convertido desde ${formatAmount(detectedAmount)} $detectedCurrencyCode${conversion.rate?.let { " · TC ${formatAmount(it, 6)}" } ?: ""}"
        conversion.missingRate ->
          "${conversion.currencyCode} · sin tipo de cambio, edita el monto"
        else -> conversion.currencyCode
      }
    }
    val defaultAccountIdx = defaultAccountIndex(runtimeContext, financialAppKey, accounts, detectedCurrencyCode)
    // Origen para transferencias: honra el par más frecuente (sourceAccountId). Si no hay par
    // o no resuelve, cae al default por moneda. Corrige el sentido invertido (antes el origen
    // siempre era el default por moneda y el destino caía a la "siguiente" cuenta por orden).
    val transferSourceIdx = frequentTransferSourceIndex(runtimeContext, accounts, defaultAccountIdx)
    val initialSourceIdx = if (selectedType == "transfer") transferSourceIdx else defaultAccountIdx
    val accountSelect = accountChipField(context, "CUENTA / ORIGEN", accounts, initialSourceIdx) { index ->
      refreshAmountForAccount(index)
    }
    root.addView(accountSelect.container)
    refreshAmountForAccount(initialSourceIdx)

    val destinationDefaultIdx = frequentTransferDestinationIndex(runtimeContext, accounts, transferSourceIdx)
    val destinationAccountSelect = accountChipField(context, "CUENTA DESTINO", accounts, destinationDefaultIdx)
    root.addView(destinationAccountSelect.container)
    transferOnlyViews.add(destinationAccountSelect.container)

    // Ahora que existen los selects, conectar el ajuste de origen/destino por tipo.
    syncAccountsForType = sync@{
      if (selectedType == "transfer") {
        accountSelect.selectIndex(transferSourceIdx)
        destinationAccountSelect.selectIndex(
          frequentTransferDestinationIndex(runtimeContext, accounts, transferSourceIdx),
        )
      } else {
        accountSelect.selectIndex(defaultAccountIdx)
      }
    }

    val baseCategories = listOf(Option(null, "Sin categoría")) +
      readOptions(runtimeContext, "categories", fallbackLabel = "Sin categoría", metaKey = "kind").sortedBy { it.label.lowercase() }
    val initialCategoryKind = if (movementType == "income") "income" else "expense"
    val aiNewCategory = aiNewCategoryOption(aiCategoryRecommendation, initialCategoryKind)
    val categories = if (aiNewCategory != null) baseCategories + aiNewCategory else baseCategories
    fun categoryVisibleForSelectedType(option: Option): Boolean {
      if (selectedType == "transfer") return option.id == null && option.createName == null
      if (option.id == null && option.createName == null) return true
      return option.meta == "both" || option.meta == selectedType
    }
    val categorySelectRef = categoryChipField(
      context,
      "CATEGORÍA (OPCIONAL)",
      categories,
      0,
      ::categoryVisibleForSelectedType,
    )
    categorySelect = categorySelectRef
    root.addView(categorySelectRef.container)
    expenseIncomeOnlyViews.add(categorySelectRef.container)

    // Local-first: priorizar resolver local instantáneo; IA refina luego con swap animado.
    // El pre-cómputo de IA ya fue disparado por DarkMoneyNotificationListenerService al detectar.
    val aiSuggestedIdx = aiSuggestedCategoryIndex(aiCategoryRecommendation, categories)
      ?.takeIf { categoryVisibleForSelectedType(categories[it]) }
    val localSuggestedIdx = suggestCategoryForOverlay(description, runtimeContext, categories, ::categoryVisibleForSelectedType)
    val initialIdx = aiSuggestedIdx ?: localSuggestedIdx
    val aiPending = aiCategoryRecommendation == null || aiCategoryPending(aiCategoryRecommendation)

    val suggestionWrap = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(6), 0, 0)
    }
    // Agrega un row de sugerencia dándole separación del anterior (espacio entre chip local
    // y chip IA / loading / terminal). Evita que se vean pegados.
    fun addSuggestionRow(view: View) {
      val lp = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.MATCH_PARENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      )
      if (suggestionWrap.childCount > 0) lp.topMargin = dp(8)
      suggestionWrap.addView(view, lp)
    }
    var currentSuggestionRow: View? = null
    // ¿El chip de sugerencia actual proviene de la IA? Si es así, el recálculo local al editar
    // la descripción NO lo pisa (la IA manda). Solo se actualiza el chip cuando es local.
    var currentSuggestionIsAi = aiSuggestedIdx != null
    // Row de carga IA. Transparencia: si hay local mostrada pero la IA sigue corriendo, lo
    // mostramos debajo (antes corría invisible). Si no hay local, hace de skeleton.
    var loadingRow: View? = null
    if (initialIdx != null && initialIdx > 0) {
      val sugCat = categories.getOrNull(initialIdx)
      if (sugCat != null) {
        val detail = if (aiSuggestedIdx != null) aiDetail(aiCategoryRecommendation) else "patrón de tus movimientos"
        currentSuggestionRow = categorySuggestionRow(context, sugCat.label, detail) {
          categorySelectRef.selectIndex(initialIdx)
        }
        addSuggestionRow(currentSuggestionRow!!)
      }
    }
    // Afordancia "IA analizando" SIEMPRE que la IA pueda llegar (haya o no sugerencia local).
    if (aiPending && selectedType != "transfer") {
      loadingRow = aiLoadingRow(context)
      addSuggestionRow(loadingRow!!)
    } else if (!aiPending && aiSuggestedIdx == null && selectedType != "transfer") {
      // La IA YA resolvió antes de abrir el overlay y NO produjo una sugerencia mejor que la
      // local. Sin esto, el usuario no veía NADA de IA (solo la local) — el caso opaco reportado.
      // Distinguimos: confirmó la local / falló de verdad / corrió sin sugerencia.
      val terminal = if (aiCategoryUnavailable(aiCategoryRecommendation)) {
        aiInfoRow(context, "IA no disponible", "No se pudo completar la sugerencia de categoría.")
      } else if (aiCategoryConfirmedLocal(aiCategoryRecommendation)) {
        if (currentSuggestionRow != null) {
          aiInfoRow(context, "IA confirmó tu categoría", "Tu patrón ya era la mejor opción.")
        } else {
          aiInfoRow(context, "IA sin sugerencia", "No encontró una categoría con suficiente confianza.")
        }
      } else {
        aiInfoRow(context, "IA sin sugerencia", "No encontró una categoría con suficiente confianza.")
      }
      addSuggestionRow(terminal)
    }
    if (suggestionWrap.childCount > 0) {
      root.addView(suggestionWrap)
      expenseIncomeOnlyViews.add(suggestionWrap)
    }

    fun removeLoadingRow() {
      loadingRow?.let { suggestionWrap.removeView(it) }
      loadingRow = null
    }
    fun detachSuggestionWrapIfEmpty() {
      if (suggestionWrap.childCount == 0) {
        (suggestionWrap.parent as? ViewGroup)?.removeView(suggestionWrap)
        expenseIncomeOnlyViews.remove(suggestionWrap)
      }
    }

    // Polling: solo si la IA aún no resolvió. Hace swap animado cuando llega (local→IA), o
    // reemplaza el row de carga por un estado terminal visible (sugerencia / sin sugerencia /
    // no disponible). El usuario siempre termina viendo en qué quedó la IA.
    if (aiPending && selectedType != "transfer") {
      val pollHandler = Handler(Looper.getMainLooper())
      // Presupuesto ~10s (la IA pre-corre al detectar y suele estar lista al abrir; los últimos
      // intentos cubren redes lentas sin dejar el spinner infinito).
      val pollSchedule = longArrayOf(500L, 700L, 900L, 1200L, 1700L, 2200L, 2800L)
      var attempts = 0
      val pollRunnable = object : Runnable {
        override fun run() {
          if (windowManager == null) return
          val updated = NotificationDetectionStore.getSuggestion(context.applicationContext, suggestionId)
          val updatedRec = updated?.optJSONObject("aiCategoryRecommendation")
          if (updatedRec != null && !aiCategoryPending(updatedRec)) {
            val aiIdx = aiSuggestedCategoryIndex(updatedRec, categories)
              ?.takeIf { categoryVisibleForSelectedType(categories[it]) }
            if (aiIdx != null && aiIdx > 0) {
              // IA produjo una sugerencia válida → swap animado (reemplaza local o carga).
              val sugCat = categories.getOrNull(aiIdx) ?: return
              val newRow = categorySuggestionRow(context, sugCat.label, aiDetail(updatedRec)) {
                categorySelectRef.selectIndex(aiIdx)
              }
              val replaced = currentSuggestionRow ?: loadingRow
              animatedSwapSuggestionRow(suggestionWrap, replaced, newRow)
              if (replaced === loadingRow) loadingRow = null
              currentSuggestionRow = newRow
              currentSuggestionIsAi = true
            } else {
              removeLoadingRow()
              // Estado terminal explícito (transparencia), distinguiendo confirmó / no disponible / sin sugerencia.
              val terminal = when {
                aiCategoryUnavailable(updatedRec) ->
                  aiInfoRow(context, "IA no disponible", "No se pudo completar la sugerencia de categoría.")
                aiCategoryConfirmedLocal(updatedRec) && currentSuggestionRow != null ->
                  aiInfoRow(context, "IA confirmó tu categoría", "Tu patrón ya era la mejor opción.")
                currentSuggestionRow == null ->
                  aiInfoRow(context, "IA sin sugerencia", "No encontró una categoría con suficiente confianza.")
                else -> null
              }
              if (terminal != null) addSuggestionRow(terminal)
              detachSuggestionWrapIfEmpty()
            }
            return
          }
          if (attempts >= pollSchedule.size) {
            // Presupuesto agotado sin respuesta. La IA SIGUE corriendo en background (headless
            // enrichment) — decir "no disponible" era mentirle al usuario (hallazgo N9); la
            // sugerencia aparecerá en el registro desde la app si termina después.
            removeLoadingRow()
            if (currentSuggestionRow == null) {
              addSuggestionRow(
                aiInfoRow(context, "IA tomando más tiempo", "Sigue analizando en segundo plano; puedes guardar sin esperar."),
              )
            }
            detachSuggestionWrapIfEmpty()
            return
          }
          val delay = pollSchedule[attempts]
          attempts++
          pollHandler.postDelayed(this, delay)
        }
      }
      pollHandler.postDelayed(pollRunnable, pollSchedule[0])
    }

    var selectedCounterpartyId: Int? = null
    var selectedNewCounterpartyName: String? = null
    var selectedCounterpartyType: String? = null
    val counterpartyLabel = counterpartyLabel(counterpartyRecommendation, runtimeContext)
    if (counterpartyLabel != null) {
      val suggestionRow = categorySuggestionRow(context, counterpartyLabel, counterpartyDetail(counterpartyRecommendation)) {
        selectedCounterpartyId = counterpartyRecommendation?.optInt("counterpartyId", 0)?.takeIf { it > 0 }
        selectedNewCounterpartyName = counterpartyRecommendation?.optString("newCounterpartyName").orEmpty().trim().takeIf { it.length >= 3 }
        selectedCounterpartyType = counterpartyRecommendation?.optString("counterpartyType").orEmpty().ifBlank { "merchant" }
      }
      val suggestionWrap = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(6), 0, 0)
      }
      suggestionWrap.addView(suggestionRow)
      root.addView(suggestionWrap)
      expenseIncomeOnlyViews.add(suggestionWrap)
    }

    var selectedRecurringType: String? = null
    var selectedRecurringName: String? = null
    var selectedRecurringFrequency: String? = null
    var selectedRecurringIntervalCount: Int? = null
    val recurringLabel = recurringLabel(recurringRecommendation)
    if (recurringLabel != null) {
      val suggestionRow = categorySuggestionRow(context, recurringLabel, recurringDetail(recurringRecommendation)) {
        selectedRecurringType = recurringRecommendation?.optString("type").orEmpty().takeIf { it == "subscription" || it == "recurring_income" }
        selectedRecurringName = recurringRecommendation?.optString("name").orEmpty().trim().takeIf { it.length >= 3 }
        selectedRecurringFrequency = recurringRecommendation?.optString("frequency").orEmpty().trim().takeIf { it.isNotBlank() }
        selectedRecurringIntervalCount = recurringRecommendation?.optInt("intervalCount", 1)?.takeIf { it > 0 } ?: 1
      }
      val suggestionWrap = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(6), 0, 0)
      }
      suggestionWrap.addView(suggestionRow)
      root.addView(suggestionWrap)
      expenseIncomeOnlyViews.add(suggestionWrap)
    }

    val riskLabel = riskLabel(riskExplanation)
    if (riskLabel != null) {
      val suggestionWrap = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(6), 0, 0)
      }
      suggestionWrap.addView(categorySuggestionRow(context, riskLabel, riskDetail(riskExplanation)) {})
      root.addView(suggestionWrap)
      expenseIncomeOnlyViews.add(suggestionWrap)
    }

    val budgetLabel = budgetLabel(budgetImpact)
    if (budgetLabel != null) {
      val suggestionWrap = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(6), 0, 0)
      }
      suggestionWrap.addView(categorySuggestionRow(context, budgetLabel, budgetDetail(budgetImpact)) {})
      root.addView(suggestionWrap)
      expenseIncomeOnlyViews.add(suggestionWrap)
    }

    val initialDescription = descriptionCleanup
      ?.optString("cleanedDescription")
      ?.trim()
      ?.takeIf { it.length >= 4 }
      ?: description
    val descriptionInput = field(
      context,
      "Descripción",
      initialDescription,
      InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE,
    )
    descriptionInput.input.minLines = 2
    root.addView(descriptionInput.container)

    // #3: al editar la descripción, recalcular la sugerencia LOCAL en vivo (con debounce).
    // La IA NO se recalcula (requeriría llamar a DeepSeek desde el overlay); si el chip actual
    // es de IA, no se pisa. Solo aplica a expense/income (en transfer no hay categoría).
    val suggestionDebounce = Handler(Looper.getMainLooper())
    var suggestionRunnable: Runnable? = null
    descriptionInput.input.addTextChangedListener(object : TextWatcher {
      override fun beforeTextChanged(s: CharSequence?, start: Int, count: Int, after: Int) {}
      override fun onTextChanged(s: CharSequence?, start: Int, before: Int, count: Int) {}
      override fun afterTextChanged(s: Editable?) {
        if (selectedType == "transfer" || currentSuggestionIsAi) return
        suggestionRunnable?.let { suggestionDebounce.removeCallbacks(it) }
        val newText = s?.toString().orEmpty()
        val r = Runnable {
          val localIdx = suggestCategoryForOverlay(newText, runtimeContext, categories, ::categoryVisibleForSelectedType)
          // Quitar el chip local previo (si quedaba) antes de re-evaluar.
          currentSuggestionRow?.let { suggestionWrap.removeView(it) }
          currentSuggestionRow = null
          if (localIdx != null && localIdx > 0) {
            val sugCat = categories.getOrNull(localIdx)
            if (sugCat != null) {
              val row = categorySuggestionRow(context, sugCat.label, "patrón de tus movimientos") {
                categorySelectRef.selectIndex(localIdx)
              }
              currentSuggestionRow = row
              // Insertar arriba del wrap para que quede sobre el loading/terminal de IA.
              suggestionWrap.addView(row, 0)
              // Asegurar que el wrap esté visible y montado (preserva su posición original).
              if (suggestionWrap.parent == null) {
                root.addView(suggestionWrap)
                expenseIncomeOnlyViews.add(suggestionWrap)
              }
              suggestionWrap.visibility = View.VISIBLE
            }
          } else if (suggestionWrap.childCount == 0) {
            // Sin sugerencia local y wrap vacío: ocultar sin desmontar (preserva posición).
            suggestionWrap.visibility = View.GONE
          }
        }
        suggestionRunnable = r
        suggestionDebounce.postDelayed(r, 500L)
      }
    })

    refreshSegments()

    val cancelBtn = actionButton(context, "Cancelar", false, dp(18)) { animatedDismiss() }.apply {
      contentDescription = "Cancelar y cerrar el registro rapido"
    }

    val saveLabel = TextView(context).apply {
      text = "Guardar"
      gravity = Gravity.CENTER
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(0xFF05070B.toInt())
    }
    val saveSpinner = ProgressBar(context, null, android.R.attr.progressBarStyleSmall).apply {
      indeterminateTintList = android.content.res.ColorStateList.valueOf(0xFF05070B.toInt())
      visibility = View.GONE
    }
    val saveBtn = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER
      background = roundedBg(0xFF6BE4C5.toInt(), dp(18))
      addView(saveSpinner, LinearLayout.LayoutParams(dp(18), dp(18)).apply { rightMargin = dp(0) })
      addView(saveLabel)
      isClickable = true
      isFocusable = true
      contentDescription = "Guardar movimiento detectado"
      setOnClickListener {
        val workspaceId = runtimeContext.optInt("workspaceId", 0).takeIf { it > 0 }
        val selectedAccountIdx = accountSelect.selectedIndex().coerceIn(0, accounts.lastIndex)
        val selectedDestinationIdx = destinationAccountSelect.selectedIndex().coerceIn(0, accounts.lastIndex)
        val selectedCategoryIdx = categorySelectRef.selectedIndex().coerceIn(0, categories.lastIndex)
        // Show loading state
        isClickable = false
        cancelBtn.isClickable = false
        cancelBtn.alpha = 0.4f
        saveLabel.text = "Guardando..."
        saveSpinner.visibility = View.VISIBLE
        (saveSpinner.layoutParams as LinearLayout.LayoutParams).rightMargin = dp(8)
        saveSpinner.requestLayout()
        NotificationDetectionSaveTaskService.start(
          context,
          suggestionId,
          notificationId,
          workspaceId,
          selectedType,
          amountInput.text.toString(),
          accounts[selectedAccountIdx].id ?: 0,
          if (selectedType == "transfer") (accounts[selectedDestinationIdx].id ?: 0) else null,
          if (selectedType == "transfer") null else categories[selectedCategoryIdx].id,
          if (selectedType == "transfer") null else categories[selectedCategoryIdx].createName,
          selectedCounterpartyId,
          selectedNewCounterpartyName,
          selectedCounterpartyType,
          selectedRecurringType,
          selectedRecurringName,
          selectedRecurringFrequency,
          selectedRecurringIntervalCount,
          descriptionInput.input.text.toString(),
        )
        // Cancela el tile inmediatamente para que la bandeja se sienta responsiva.
        // markSuggestionRegistered (al final del headless task) volverá a cancelar, lo cual es idempotente.
        if (notificationId > 0) {
          context.getSystemService(NotificationManager::class.java)?.cancel(notificationId)
        }
        Handler(Looper.getMainLooper()).postDelayed({ animatedDismiss() }, 900)
      }
    }

    val actions = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(18), 0, 0)
      gravity = Gravity.CENTER_VERTICAL
    }
    actions.addView(cancelBtn, LinearLayout.LayoutParams(0, dp(48), 1f).apply { rightMargin = dp(10) })
    actions.addView(saveBtn, LinearLayout.LayoutParams(0, dp(48), 1.35f))
    root.addView(actions)

    val scroll = ScrollView(context).apply {
      setPadding(dp(14), dp(14), dp(14), dp(14))
      addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
    panelView = scroll

    val panelWidth = (context.resources.displayMetrics.widthPixels * 0.9f).toInt()
    backdrop.addView(
      scroll,
      FrameLayout.LayoutParams(panelWidth, ViewGroup.LayoutParams.WRAP_CONTENT, Gravity.CENTER),
    )

    backdrop.post { animateIn(backdrop, scroll) }
    return backdrop
  }

  private fun field(context: Context, label: String, value: String, inputTypeValue: Int): FieldRefs {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(10), 0, 0)
    }
    container.addView(TextView(context).apply {
      text = label
      textSize = 11f
      setTextColor(0xFF96A2B5.toInt())
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, 0, 0, dp(6))
    })
    val input = EditText(context).apply {
      setText(value)
      inputType = inputTypeValue
      textSize = 16f
      setTextColor(0xFFF5F7FB.toInt())
      setHintTextColor(0xFF96A2B5.toInt())
      setSingleLine(inputTypeValue and InputType.TYPE_TEXT_FLAG_MULTI_LINE == 0)
      setPadding(dp(13), dp(10), dp(13), dp(10))
      background = roundedBg(0xFF161F2A.toInt(), dp(16), 0x1FFFFFFF, dp(1))
      contentDescription = label
    }
    container.addView(input)
    return FieldRefs(container, input)
  }

  private fun accountChipField(
    context: Context,
    label: String,
    options: List<Option>,
    defaultIndex: Int,
    onSelect: (Int) -> Unit = {},
  ): SelectRefs {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    var currentIndex = defaultIndex.coerceIn(0, options.lastIndex.coerceAtLeast(0))
    val chipViews = mutableListOf<LinearLayout>()

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(10), 0, 0)
    }
    container.addView(TextView(context).apply {
      text = label
      textSize = 10f
      setTextColor(0xFF96A2B5.toInt())
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, 0, 0, dp(6))
    })

    fun refreshChips() {
      chipViews.forEachIndexed { index, chip ->
        val selected = index == currentIndex
        chip.background = roundedBg(
          if (selected) 0x1A6BE4C5.toInt() else 0xFF161F2A.toInt(),
          dp(12),
          if (selected) 0xFF6BE4C5.toInt() else 0x1FFFFFFF,
          dp(1),
        )
        (chip.getChildAt(0) as? TextView)?.setTextColor(
          if (selected) 0xFF6BE4C5.toInt() else 0xFFF5F7FB.toInt()
        )
        (chip.getChildAt(1) as? TextView)?.setTextColor(
          if (selected) 0xFF6BE4C5.toInt() else 0xFF96A2B5.toInt()
        )
      }
    }

    val chipRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(2), dp(4), dp(2))
    }

    options.forEachIndexed { index, option ->
      val chip = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(dp(12), dp(8), dp(12), dp(8))
        isClickable = true
        isFocusable = true
        contentDescription = if (option.meta.isNullOrBlank()) {
          "$label: ${option.label}"
        } else {
          "$label: ${option.label}, ${option.meta}"
        }
        setOnClickListener {
          currentIndex = index
          refreshChips()
          onSelect(index)
        }
        addView(TextView(context).apply {
          text = option.label
          textSize = 13f
          typeface = Typeface.DEFAULT_BOLD
          setTextColor(0xFFF5F7FB.toInt())
        })
        if (!option.meta.isNullOrBlank()) {
          addView(TextView(context).apply {
            text = option.meta
            textSize = 11f
            setTextColor(0xFF96A2B5.toInt())
          })
        }
      }
      val lp = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      ).apply { if (index > 0) leftMargin = dp(8) }
      chipRow.addView(chip, lp)
      chipViews.add(chip)
    }

    refreshChips()

    val scroll = HorizontalScrollView(context).apply {
      isHorizontalScrollBarEnabled = false
      addView(chipRow)
    }
    container.addView(scroll, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    ))
    val selectFn: (Int) -> Unit = { index ->
      currentIndex = index.coerceIn(0, options.lastIndex.coerceAtLeast(0))
      refreshChips()
      onSelect(currentIndex)
    }
    return SelectRefs(container, { currentIndex }, selectFn)
  }

  private fun categoryChipField(
    context: Context,
    label: String,
    options: List<Option>,
    defaultIndex: Int,
    isOptionVisible: (Option) -> Boolean = { true },
  ): SelectRefs {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    var currentIndex = defaultIndex.coerceIn(0, options.lastIndex.coerceAtLeast(0))
    val chipViews = mutableListOf<TextView>()

    val container = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(10), 0, 0)
    }
    container.addView(TextView(context).apply {
      text = label
      textSize = 10f
      setTextColor(0xFF96A2B5.toInt())
      typeface = Typeface.DEFAULT_BOLD
      setPadding(0, 0, 0, dp(6))
    })

    fun refreshChips() {
      val visibleIndexes = options.indices.filter { isOptionVisible(options[it]) }
      if (visibleIndexes.isNotEmpty() && !visibleIndexes.contains(currentIndex)) {
        currentIndex = visibleIndexes.first()
      }
      chipViews.forEachIndexed { index, chip ->
        val visible = visibleIndexes.contains(index)
        chip.visibility = if (visible) View.VISIBLE else View.GONE
        val selected = index == currentIndex
        chip.setTextColor(if (selected) 0xFF05070B.toInt() else 0xFF96A2B5.toInt())
        chip.background = roundedBg(
          if (selected) 0xFF6BE4C5.toInt() else 0xFF161F2A.toInt(),
          dp(20),
          if (selected) null else 0x1FFFFFFF,
          dp(1),
        )
      }
    }

    val chipRow = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(0, dp(2), dp(4), dp(2))
    }

    options.forEachIndexed { index, option ->
      val chip = TextView(context).apply {
        text = option.label
        textSize = 13f
        typeface = Typeface.DEFAULT_BOLD
        setPadding(dp(14), dp(7), dp(14), dp(7))
        isClickable = true
        isFocusable = true
        setOnClickListener { currentIndex = index; refreshChips() }
      }
      val lp = LinearLayout.LayoutParams(
        ViewGroup.LayoutParams.WRAP_CONTENT,
        ViewGroup.LayoutParams.WRAP_CONTENT,
      ).apply { if (index > 0) leftMargin = dp(8) }
      chipRow.addView(chip, lp)
      chipViews.add(chip)
    }

    refreshChips()

    val scroll = HorizontalScrollView(context).apply {
      isHorizontalScrollBarEnabled = false
      addView(chipRow)
    }
    container.addView(scroll, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    ))
    val selectFn: (Int) -> Unit = { index ->
      currentIndex = index.coerceIn(0, options.lastIndex.coerceAtLeast(0))
      refreshChips()
    }
    return SelectRefs(container, { currentIndex }, selectFn, ::refreshChips)
  }

  private fun actionButton(
    context: Context,
    label: String,
    primary: Boolean,
    radius: Int,
    onClick: () -> Unit,
  ): TextView {
    return TextView(context).apply {
      text = label
      gravity = Gravity.CENTER
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(if (primary) 0xFF05070B.toInt() else 0xFFF5F7FB.toInt())
      background = if (primary) {
        roundedBg(0xFF6BE4C5.toInt(), radius)
      } else {
        roundedBg(0x12FFFFFF, radius, 0x1FFFFFFF, 1)
      }
      setOnClickListener { onClick() }
    }
  }

  private fun styleSegment(view: TextView, selected: Boolean, accent: Int, radius: Int) {
    view.setTextColor(if (selected) 0xFF05070B.toInt() else 0xFF96A2B5.toInt())
    view.background = if (selected) roundedBg(accent, radius) else roundedBg(0x00000000, radius)
  }

  private fun roundedBg(
    color: Int,
    radius: Int,
    strokeColor: Int? = null,
    strokeWidth: Int = 0,
  ): GradientDrawable {
    return GradientDrawable().apply {
      setColor(color)
      cornerRadius = radius.toFloat()
      if (strokeColor != null && strokeWidth > 0) setStroke(strokeWidth, strokeColor)
    }
  }

  private data class FieldRefs(
    val container: LinearLayout,
    val input: EditText,
  )

  private data class SelectRefs(
    val container: LinearLayout,
    val selectedIndex: () -> Int,
    val selectIndex: (Int) -> Unit = {},
    val refresh: () -> Unit = {},
  )

  private data class Option(
    val id: Int?,
    val label: String,
    val meta: String? = null,
    val createName: String? = null,
  )

  private data class AmountConversion(
    val amount: Double,
    val currencyCode: String,
    val rate: Double?,
    val converted: Boolean,
    val missingRate: Boolean,
  )

  private fun parseAmount(value: String): Double {
    val parsed = value.replace(",", ".").toDoubleOrNull()
    return parsed?.takeIf { it.isFinite() && it > 0 } ?: 0.0
  }

  private fun formatAmount(value: Double, maxDecimals: Int = 2): String {
    if (!value.isFinite()) return ""
    val pattern = "%.${maxDecimals}f"
    return String.format(Locale.US, pattern, value)
      .replace(Regex("0+$"), "")
      .replace(Regex("\\.$"), "")
  }

  private fun currencyFromAmountLabel(value: String): String {
    return if (Regex("(?i)(usd|us\\$|\\$)").containsMatchIn(value) && !value.contains("S/", ignoreCase = true)) {
      "USD"
    } else {
      "PEN"
    }
  }

  private fun sortAccountsForDetectedCurrency(accounts: List<Option>, currencyCode: String): List<Option> {
    val normalizedCurrency = currencyCode.uppercase()
    return accounts.sortedWith(
      compareByDescending<Option> { it.meta?.uppercase() == normalizedCurrency }
        .thenBy { it.label.lowercase() }
    )
  }

  private fun resolveExchangeRate(
    runtimeContext: JSONObject,
    fromCurrencyCode: String,
    toCurrencyCode: String,
    workspaceBaseCurrencyCode: String,
  ): Double? {
    val from = fromCurrencyCode.uppercase()
    val to = toCurrencyCode.uppercase()
    val base = workspaceBaseCurrencyCode.uppercase()
    if (from.isBlank() || to.isBlank()) return null
    if (from == to) return 1.0

    val rates = runtimeContext.optJSONArray("exchangeRates")
    var latestEffectiveAt = ""
    var resolved: Double? = null
    if (rates != null) {
      for (index in 0 until rates.length()) {
        val rate = rates.optJSONObject(index) ?: continue
        val rateFrom = rate.optString("fromCurrencyCode").uppercase()
        val rateTo = rate.optString("toCurrencyCode").uppercase()
        val value = rate.optDouble("rate", 0.0).takeIf { it.isFinite() && it > 0 } ?: continue
        val matchesDirect = rateFrom == from && rateTo == to
        val matchesInverse = rateFrom == to && rateTo == from
        if (!matchesDirect && !matchesInverse) continue
        val effectiveAt = rate.optString("effectiveAt")
        if (resolved != null && effectiveAt < latestEffectiveAt) continue
        latestEffectiveAt = effectiveAt
        resolved = if (matchesDirect) value else 1.0 / value
      }
    }
    if (resolved != null) return resolved

    if (from != base && to != base) {
      val toBase = resolveExchangeRate(runtimeContext, from, base, base)
      val baseToTarget = resolveExchangeRate(runtimeContext, base, to, base)
      if (toBase != null && baseToTarget != null) return toBase * baseToTarget
    }
    return null
  }

  private fun convertAmount(
    amount: Double,
    fromCurrencyCode: String,
    toCurrencyCode: String,
    runtimeContext: JSONObject,
    workspaceBaseCurrencyCode: String,
  ): AmountConversion {
    val from = fromCurrencyCode.uppercase()
    val to = toCurrencyCode.uppercase()
    if (from == to) {
      return AmountConversion(amount, to, 1.0, converted = false, missingRate = false)
    }
    val rate = resolveExchangeRate(runtimeContext, from, to, workspaceBaseCurrencyCode)
    if (rate == null) {
      return AmountConversion(amount, to, null, converted = false, missingRate = true)
    }
    return AmountConversion(
      amount = kotlin.math.round(amount * rate * 100.0) / 100.0,
      currencyCode = to,
      rate = rate,
      converted = true,
      missingRate = false,
    )
  }

  private fun aiConfidence(recommendation: JSONObject?): Double {
    return recommendation?.optDouble("confidence", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
  }

  private fun aiDetail(recommendation: JSONObject?): String {
    val confidence = (aiConfidence(recommendation) * 100).toInt().coerceIn(0, 100)
    val firstReason = recommendation?.optJSONArray("reasons")?.optString(0).orEmpty()
    return listOf("Mejor sugerencia · $confidence%", firstReason.ifBlank { null }).filterNotNull().joinToString(" · ")
  }

  private fun aiCategoryPending(recommendation: JSONObject?): Boolean {
    return recommendation?.optString("status") == "pending"
  }

  private fun aiSuggestedCategoryIndex(recommendation: JSONObject?, categories: List<Option>): Int? {
    if (recommendation == null || aiConfidence(recommendation) < 0.65) return null
    val type = recommendation.optString("type")
    if (type == "existing_category") {
      val categoryId = recommendation.optInt("categoryId", 0).takeIf { it > 0 } ?: return null
      return categories.indexOfFirst { it.id == categoryId }.takeIf { it > 0 }
    }
    if (type == "new_category") {
      val newName = recommendation.optString("newCategoryName").trim()
      if (newName.length < 3) return null
      return categories.indexOfFirst { it.createName == newName }.takeIf { it > 0 }
    }
    return null
  }

  private fun aiNewCategoryOption(recommendation: JSONObject?, kind: String): Option? {
    if (recommendation == null || recommendation.optString("type") != "new_category" || aiConfidence(recommendation) < 0.65) return null
    val newName = recommendation.optString("newCategoryName").trim().replace(Regex("\\s+"), " ")
    if (newName.length < 3) return null
    return Option(null, "Crear: $newName", kind, newName)
  }

  private fun counterpartyConfidence(recommendation: JSONObject?): Double {
    return recommendation?.optDouble("confidence", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
  }

  private fun counterpartyDetail(recommendation: JSONObject?): String {
    val confidence = (counterpartyConfidence(recommendation) * 100).toInt().coerceIn(0, 100)
    val firstReason = recommendation?.optJSONArray("reasons")?.optString(0).orEmpty()
    return listOf("Contraparte · $confidence%", firstReason.ifBlank { null }).filterNotNull().joinToString(" · ")
  }

  private fun counterpartyLabel(recommendation: JSONObject?, runtimeContext: JSONObject): String? {
    if (recommendation == null || counterpartyConfidence(recommendation) < 0.65) return null
    val type = recommendation.optString("type")
    if (type == "existing_counterparty") {
      val counterpartyId = recommendation.optInt("counterpartyId", 0).takeIf { it > 0 } ?: return null
      val array = runtimeContext.optJSONArray("counterparties") ?: return recommendation.optString("counterpartyName").takeIf { it.isNotBlank() }
      for (index in 0 until array.length()) {
        val item = array.optJSONObject(index) ?: continue
        if (item.optInt("id", 0) == counterpartyId) return item.optString("name").takeIf { it.isNotBlank() }
      }
      return recommendation.optString("counterpartyName").takeIf { it.isNotBlank() }
    }
    if (type == "new_counterparty") {
      val newName = recommendation.optString("newCounterpartyName").trim().replace(Regex("\\s+"), " ")
      if (newName.length < 3) return null
      return "Crear: $newName"
    }
    return null
  }

  private fun recurringConfidence(recommendation: JSONObject?): Double {
    return recommendation?.optDouble("confidence", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
  }

  private fun recurringFrequencyLabel(frequency: String): String {
    return when (frequency) {
      "weekly" -> "semanal"
      "biweekly" -> "quincenal"
      "monthly" -> "mensual"
      "quarterly" -> "trimestral"
      "yearly" -> "anual"
      else -> "recurrente"
    }
  }

  private fun recurringDetail(recommendation: JSONObject?): String {
    val confidence = (recurringConfidence(recommendation) * 100).toInt().coerceIn(0, 100)
    val frequency = recurringFrequencyLabel(recommendation?.optString("frequency").orEmpty())
    val firstReason = recommendation?.optJSONArray("reasons")?.optString(0).orEmpty()
    return listOf("$confidence% · $frequency", firstReason.ifBlank { null }).filterNotNull().joinToString(" · ")
  }

  private fun recurringLabel(recommendation: JSONObject?): String? {
    if (recommendation == null || recurringConfidence(recommendation) < 0.65) return null
    val type = recommendation.optString("type")
    val name = recommendation.optString("name").trim().replace(Regex("\\s+"), " ")
    if (name.length < 3) return null
    return when (type) {
      "subscription" -> "Crear suscripción: $name"
      "recurring_income" -> "Crear ingreso fijo: $name"
      else -> null
    }
  }

  private fun riskConfidence(explanation: JSONObject?): Double {
    return explanation?.optDouble("confidence", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
  }

  private fun riskLabel(explanation: JSONObject?): String? {
    if (explanation == null || riskConfidence(explanation) < 0.65) return null
    return explanation.optString("title").ifBlank { "Revisar antes de guardar" }
  }

  private fun riskDetail(explanation: JSONObject?): String {
    val confidence = (riskConfidence(explanation) * 100).toInt().coerceIn(0, 100)
    val text = explanation?.optString("explanation").orEmpty()
    return listOf("$confidence%", text.ifBlank { null }).filterNotNull().joinToString(" · ")
  }

  private fun budgetConfidence(impact: JSONObject?): Double {
    return impact?.optDouble("confidence", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
  }

  private fun budgetLabel(impact: JSONObject?): String? {
    if (impact == null || budgetConfidence(impact) < 0.65) return null
    return impact.optString("title").ifBlank { "Impacto en presupuesto" }
  }

  private fun budgetDetail(impact: JSONObject?): String {
    val confidence = (budgetConfidence(impact) * 100).toInt().coerceIn(0, 100)
    val text = impact?.optString("recommendation").orEmpty()
    return listOf("$confidence%", text.ifBlank { null }).filterNotNull().joinToString(" · ")
  }

  private fun readOptions(runtimeContext: JSONObject, key: String, fallbackLabel: String, metaKey: String? = null): List<Option> {
    val array = runtimeContext.optJSONArray(key)
    if (array == null || array.length() == 0) return listOf(Option(0, fallbackLabel))
    val options = mutableListOf<Option>()
    for (index in 0 until array.length()) {
      val item = array.optJSONObject(index) ?: continue
      val id = if (item.has("id")) item.optInt("id") else null
      val label = item.optString("name").ifBlank { fallbackLabel }
      val meta = if (metaKey != null) item.optString(metaKey).ifBlank { null } else null
      options.add(Option(id, label, meta))
    }
    return options.ifEmpty { listOf(Option(0, fallbackLabel)) }
  }

  private fun normalizeText(value: String): String {
    val nfd = Normalizer.normalize(value, Normalizer.Form.NFD)
    return nfd
      .lowercase()
      .replace(Regex("\\p{Mn}"), "")
      .replace(Regex("[0-9]"), " ")
      .replace(Regex("[^a-z\\s]"), " ")
      .replace(Regex("\\s+"), " ")
      .trim()
  }

  private fun suggestCategoryForOverlay(
    description: String,
    runtimeContext: JSONObject,
    categories: List<Option>,
    isOptionVisible: (Option) -> Boolean = { true },
  ): Int? {
    if (description.isBlank()) return null
    val normalized = normalizeText(description)
    val words = normalized.split(" ").filter { it.length >= 3 }
    if (words.isEmpty()) return null

    // Tier 1: learningFeedback with stricter confidence for short or ambiguous text.
    val feedback = runtimeContext.optJSONArray("learningFeedback")
    if (feedback != null) {
      val wordSet = words.toSet()
      var bestSim = 0.0
      var bestCatId: Int? = null
      for (i in 0 until feedback.length()) {
        val fb = feedback.optJSONObject(i) ?: continue
        val fbDesc = fb.optString("normalizedDescription").ifBlank { null } ?: continue
        val fbWords = fbDesc.split(" ").filter { it.length >= 3 }.toSet()
        val union = (wordSet union fbWords).size
        if (union == 0) continue
        val intersection = (wordSet intersect fbWords).size
        val sim = intersection.toDouble() / union
        val exact = fbDesc == normalized
        val confident = exact || (wordSet.size > 1 && fbWords.size > 1 && sim >= 0.62)
        if (confident && sim > bestSim) {
          bestSim = sim
          bestCatId = fb.optInt("acceptedCategoryId", 0).takeIf { it > 0 }
        }
      }
      if (bestCatId != null) {
        val idx = categories.indexOfFirst { it.id == bestCatId && isOptionVisible(it) }
        if (idx > 0) return idx
      }
    }

    // Tier 2: wordToCategory pattern map — cumulative word-frequency score.
    // Umbrales más permisivos: sugerimos con evidencia moderada y dejamos que el badge
    // "patrón histórico" haga el trabajo de transparencia.
    val wordToCategory = runtimeContext.optJSONObject("wordToCategory")
    if (wordToCategory != null) {
      val scores = mutableMapOf<Int, Int>()
      for (word in words) {
        val entries = wordToCategory.optJSONArray(word) ?: continue
        for (j in 0 until entries.length()) {
          val entry = entries.optJSONObject(j) ?: continue
          val catId = entry.optInt("id", 0)
          val count = entry.optInt("count", 0)
          if (catId > 0 && count >= 2) scores[catId] = (scores[catId] ?: 0) + count
        }
      }
      val best = scores.entries.maxByOrNull { it.value }
      if (best != null) {
        val secondScore = scores.entries
          .filter { it.key != best.key }
          .maxOfOrNull { it.value } ?: 0
        val scoreGap = best.value - secondScore
        val relativeGap = if (best.value + secondScore > 0) best.value.toDouble() / (best.value + secondScore) else 0.0
        val singleWord = words.toSet().size <= 1
        if (best.value < 1) return null
        // Si el gap absoluto es chico pero el relativo es dominante (≥65%), igual sugerimos.
        if (secondScore > 0 && scoreGap < 2 && relativeGap < 0.65) return null
        if (singleWord && best.value < 2) return null
        val idx = categories.indexOfFirst { it.id == best.key && isOptionVisible(it) }
        if (idx > 0) return idx
      }
    }

    // Tier 3: counterpartyToCategory. Si alguna contraparte conocida aparece en la descripción,
    // y tiene una categoría dominante en el historial, sugerirla. Cubre casos como
    // "Yape Mama" → Familia cuando "Yape" y "Mama" individualmente no son señal fuerte.
    val counterpartyToCategory = runtimeContext.optJSONObject("counterpartyToCategory")
    val counterparties = runtimeContext.optJSONArray("counterparties")
    if (counterpartyToCategory != null && counterparties != null) {
      for (i in 0 until counterparties.length()) {
        val entry = counterparties.optJSONObject(i) ?: continue
        val name = entry.optString("name")
        if (name.isBlank()) continue
        val normalizedName = normalizeText(name)
        if (normalizedName.length < 3 || !normalized.contains(normalizedName)) continue
        val cpId = entry.optInt("id", 0).takeIf { it > 0 } ?: continue
        val catArray = counterpartyToCategory.optJSONArray(cpId.toString()) ?: continue
        var bestCatId = 0
        var bestCount = 0
        var totalCount = 0
        for (j in 0 until catArray.length()) {
          val catEntry = catArray.optJSONObject(j) ?: continue
          val cId = catEntry.optInt("id", 0)
          val c = catEntry.optInt("count", 0)
          totalCount += c
          if (c > bestCount && cId > 0) { bestCount = c; bestCatId = cId }
        }
        if (bestCatId > 0 && totalCount >= 2 && bestCount.toDouble() / totalCount >= 0.6) {
          val idx = categories.indexOfFirst { it.id == bestCatId && isOptionVisible(it) }
          if (idx > 0) return idx
        }
      }
    }

    return null
  }

  /**
   * Swap suave del row de sugerencia cuando la IA llega tras mostrar la local.
   * Fade out 180 ms del viejo, replace, fade in 200 ms del nuevo. Si oldRow es null
   * (era skeleton), reemplaza directo con fade in.
   */
  private fun animatedSwapSuggestionRow(container: LinearLayout, oldRow: View?, newRow: View) {
    if (oldRow == null) {
      container.removeAllViews()
      newRow.alpha = 0f
      container.addView(newRow)
      newRow.animate().alpha(1f).setDuration(200L).start()
      return
    }
    oldRow.animate().alpha(0f).setDuration(180L).withEndAction {
      container.removeView(oldRow)
      newRow.alpha = 0f
      container.addView(newRow)
      newRow.animate().alpha(1f).setDuration(200L).start()
    }.start()
  }

  /** Desvanece una vista y la quita de su contenedor (feedback al aplicar una sugerencia). */
  private fun fadeOutAndRemove(view: View) {
    view.animate().alpha(0f).setDuration(180L).withEndAction {
      (view.parent as? ViewGroup)?.removeView(view)
    }.start()
  }

  private fun categorySuggestionRow(
    context: Context,
    categoryName: String,
    detail: String,
    onApply: () -> Unit,
  ): LinearLayout {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(8), dp(8), dp(8))
      background = roundedBg(0x1A6BE4C5.toInt(), dp(12), 0xFF6BE4C5.toInt(), dp(1))
    }
    val textCol = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
    }
    textCol.addView(TextView(context).apply {
      text = "Sugerida: $categoryName"
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(0xFF6BE4C5.toInt())
    })
    textCol.addView(TextView(context).apply {
      text = detail
      textSize = 10f
      setTextColor(0xFF96A2B5.toInt())
    })
    val applyBtn = TextView(context).apply {
      text = "Aplicar"
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(0xFF05070B.toInt())
      gravity = Gravity.CENTER
      setPadding(dp(12), dp(6), dp(12), dp(6))
      background = roundedBg(0xFF6BE4C5.toInt(), dp(20))
      isClickable = true
      isFocusable = true
      setOnClickListener {
        onApply()
        // Feedback de confirmación: tras aplicar, el chip se desvanece (la categoría queda
        // resaltada arriba como confirmación). Evita que el usuario crea que falta aplicar.
        fadeOutAndRemove(row)
      }
    }
    row.addView(textCol, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    row.addView(applyBtn, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      leftMargin = dp(8)
    })
    return row
  }

  private fun aiLoadingRow(context: Context): FrameLayout {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val container = FrameLayout(context).apply {
      background = roundedBg(0xFF07101A.toInt(), dp(12), 0x386BE4C5, dp(1))
    }
    val gradient = View(context).apply {
      alpha = 0.55f
      background = GradientDrawable(
        GradientDrawable.Orientation.LEFT_RIGHT,
        intArrayOf(
          0xFF8EA5FF.toInt(),
          0xFFFF8F9E.toInt(),
          0xFFD7BE7B.toInt(),
          0xFF6BE4C5.toInt(),
        ),
      )
    }
    container.addView(gradient, FrameLayout.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, dp(2), Gravity.TOP))

    val content = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(9), dp(12), dp(9))
    }
    val badge = TextView(context).apply {
      text = "IA"
      textSize = 10f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(0xFF6BE4C5.toInt())
      background = roundedBg(0x1A6BE4C5.toInt(), dp(999), 0x3D6BE4C5, dp(1))
    }
    val textCol = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
    }
    textCol.addView(TextView(context).apply {
      text = "Preparando mejor sugerencia"
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(0xFFF5F7FB.toInt())
    })
    textCol.addView(TextView(context).apply {
      text = "Confirmaremos o mejoraremos la categoría actual."
      textSize = 10f
      setTextColor(0xFF96A2B5.toInt())
    })
    content.addView(badge, LinearLayout.LayoutParams(dp(28), dp(28)).apply { rightMargin = dp(9) })
    content.addView(textCol, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    container.addView(content)

    val animator = ValueAnimator.ofFloat(0f, 1f).apply {
      duration = 2200L
      repeatMode = ValueAnimator.REVERSE
      repeatCount = ValueAnimator.INFINITE
      interpolator = AccelerateDecelerateInterpolator()
      addUpdateListener {
        val value = it.animatedValue as Float
        gradient.alpha = 0.45f + (value * 0.4f)
        gradient.scaleX = 0.98f + (value * 0.04f)
      }
    }
    container.addOnAttachStateChangeListener(object : View.OnAttachStateChangeListener {
      override fun onViewAttachedToWindow(v: View) {
        if (!animator.isStarted) animator.start()
      }

      override fun onViewDetachedFromWindow(v: View) {
        animator.cancel()
      }
    })
    return container
  }

  /**
   * Row terminal informativo (no accionable): transparencia para el usuario cuando la IA
   * corrió pero no produjo una mejor sugerencia, no pudo correr, o confirmó la local.
   * Estilo muteado para no competir con la sugerencia accionable.
   */
  private fun aiInfoRow(context: Context, title: String, detail: String): LinearLayout {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val row = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      gravity = Gravity.CENTER_VERTICAL
      setPadding(dp(12), dp(8), dp(12), dp(8))
      background = roundedBg(0xFF0B1018.toInt(), dp(12), 0x1FFFFFFF, dp(1))
    }
    val badge = TextView(context).apply {
      text = "IA"
      textSize = 10f
      typeface = Typeface.DEFAULT_BOLD
      gravity = Gravity.CENTER
      setTextColor(0xFF96A2B5.toInt())
      background = roundedBg(0x14FFFFFF, dp(999), 0x1FFFFFFF, dp(1))
    }
    val textCol = LinearLayout(context).apply {
      orientation = LinearLayout.VERTICAL
    }
    textCol.addView(TextView(context).apply {
      text = title
      textSize = 12f
      typeface = Typeface.DEFAULT_BOLD
      setTextColor(0xFFC4CCD8.toInt())
    })
    textCol.addView(TextView(context).apply {
      text = detail
      textSize = 10f
      setTextColor(0xFF96A2B5.toInt())
    })
    row.addView(badge, LinearLayout.LayoutParams(dp(28), dp(28)).apply { rightMargin = dp(9) })
    row.addView(textCol, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    return row
  }

  private fun aiCategoryUnavailable(recommendation: JSONObject?): Boolean {
    return recommendation?.optString("status") == "unavailable"
  }

  /** La IA revisó y confió en la sugerencia local (no llamó al modelo o no halló algo mejor). */
  private fun aiCategoryConfirmedLocal(recommendation: JSONObject?): Boolean {
    return recommendation?.optString("status") == "local_confirmed"
  }

  private fun defaultAccountIndex(
    runtimeContext: JSONObject,
    financialAppKey: String,
    accounts: List<Option>,
    detectedCurrencyCode: String,
  ): Int {
    val detected = detectedCurrencyCode.uppercase()
    val settings = runtimeContext.optJSONArray("settings")
    if (settings != null) {
      for (index in 0 until settings.length()) {
        val setting = settings.optJSONObject(index) ?: continue
        if (setting.optString("financialAppKey") != financialAppKey) continue
        val accountId = setting.optInt("defaultAccountId", 0)
        val accountIndex = accounts.indexOfFirst { it.id == accountId }
        if (accountIndex >= 0 && accounts[accountIndex].meta?.uppercase() == detected) return accountIndex
        break
      }
    }
    val currencyIndex = accounts.indexOfFirst { it.meta?.uppercase() == detected }
    if (currencyIndex >= 0) return currencyIndex
    if (settings != null) {
      for (index in 0 until settings.length()) {
        val setting = settings.optJSONObject(index) ?: continue
        if (setting.optString("financialAppKey") != financialAppKey) continue
        val accountId = setting.optInt("defaultAccountId", 0)
        val accountIndex = accounts.indexOfFirst { it.id == accountId }
        if (accountIndex >= 0) return accountIndex
      }
    }
    return 0
  }

  /**
   * Índice de la cuenta ORIGEN para una transferencia: honra `frequentTransferPair.sourceAccountId`
   * (par más usado, p. ej. Sueldo). Si no hay par o no resuelve a una cuenta, cae al default por
   * moneda/settings. Sin esto, el origen siempre era el default por moneda (p. ej. Principal) y el
   * destino terminaba siendo la "siguiente" cuenta por orden, invirtiendo el sentido.
   */
  private fun frequentTransferSourceIndex(
    runtimeContext: JSONObject,
    accounts: List<Option>,
    fallbackIdx: Int,
  ): Int {
    val pair = runtimeContext.optJSONObject("frequentTransferPair")
    if (pair != null) {
      val srcId = pair.optInt("sourceAccountId", 0)
      val srcMatch = accounts.indexOfFirst { it.id == srcId }
      if (srcMatch >= 0) return srcMatch
    }
    return fallbackIdx
  }

  private fun frequentTransferDestinationIndex(
    runtimeContext: JSONObject,
    accounts: List<Option>,
    sourceIdx: Int,
  ): Int {
    val pair = runtimeContext.optJSONObject("frequentTransferPair")
    if (pair != null) {
      val srcId = pair.optInt("sourceAccountId", 0)
      val dstId = pair.optInt("destinationAccountId", 0)
      val srcMatch = accounts.indexOfFirst { it.id == srcId }
      val dstMatch = accounts.indexOfFirst { it.id == dstId }
      if (srcMatch == sourceIdx && dstMatch >= 0) return dstMatch
      // If source doesn't match (different account selected), still try to use the frequent destination
      if (dstMatch >= 0 && dstMatch != sourceIdx) return dstMatch
    }
    return if (accounts.size > 1) (sourceIdx + 1) % accounts.size else 0
  }
}
