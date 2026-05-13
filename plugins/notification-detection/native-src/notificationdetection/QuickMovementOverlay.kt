package com.darkmoney.app.notificationdetection

import android.content.Context
import android.graphics.PixelFormat
import android.graphics.Typeface
import android.graphics.drawable.GradientDrawable
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.text.InputType
import android.view.Gravity
import android.view.View
import android.view.ViewGroup
import android.view.WindowManager
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
    val amount = suggestion?.optString("amountLabel").orEmpty().replace(Regex("[^0-9.,]"), "")
    val description = suggestion?.optString("text").orEmpty().ifBlank {
      suggestion?.optString("title").orEmpty()
    }
    val movementType = suggestion?.optString("movementType").orEmpty()
    val aiCategoryRecommendation = suggestion?.optJSONObject("aiCategoryRecommendation")

    val runtimeContext = NotificationDetectionStore.getRuntimeContext(appContext)
    val view = buildOverlay(appContext, suggestionId, notificationId, appName, financialAppKey, amount, description, movementType, runtimeContext, aiCategoryRecommendation)

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

    manager.addView(view, params)
    overlayView = view
    windowManager = manager
    isDismissing = false
  }

  fun dismiss() {
    val view = overlayView ?: return
    val manager = windowManager
    overlayView = null
    panelView = null
    windowManager = null
    isDismissing = false
    try {
      manager?.removeViewImmediate(view)
    } catch (_: Exception) {
      // The view may already be detached if Android removed the overlay.
    }
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
    amount: String,
    description: String,
    movementType: String,
    runtimeContext: JSONObject,
    aiCategoryRecommendation: JSONObject?,
  ): View {
    val density = context.resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

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
    }
    amountCard.addView(amountInput)
    root.addView(amountCard, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(16) })

    var selectedType = if (movementType == "income") "income" else "expense"
    val segment = LinearLayout(context).apply {
      orientation = LinearLayout.HORIZONTAL
      setPadding(dp(4), dp(4), dp(4), dp(4))
      background = roundedBg(0xFF161F2A.toInt(), dp(18), 0x1AFFFFFF, dp(1))
    }
    lateinit var expenseSegment: TextView
    lateinit var incomeSegment: TextView
    fun refreshSegments() {
      styleSegment(expenseSegment, selectedType == "expense", 0xFFFF8F9E.toInt(), dp(14))
      styleSegment(incomeSegment, selectedType == "income", 0xFF6BE4C5.toInt(), dp(14))
    }
    expenseSegment = TextView(context).apply {
      text = "Gasto"
      gravity = Gravity.CENTER
      textSize = 14f
      typeface = Typeface.DEFAULT_BOLD
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
      setOnClickListener {
        selectedType = "income"
        refreshSegments()
      }
    }
    segment.addView(expenseSegment, LinearLayout.LayoutParams(0, dp(42), 1f))
    segment.addView(incomeSegment, LinearLayout.LayoutParams(0, dp(42), 1f))
    refreshSegments()
    root.addView(segment, LinearLayout.LayoutParams(
      ViewGroup.LayoutParams.MATCH_PARENT,
      ViewGroup.LayoutParams.WRAP_CONTENT,
    ).apply { topMargin = dp(12) })

    val accounts = readOptions(runtimeContext, "accounts", fallbackLabel = "Sin cuenta asignada", metaKey = "currencyCode")
    val defaultAccountIdx = defaultAccountIndex(runtimeContext, financialAppKey, accounts)
    val accountSelect = accountChipField(context, "CUENTA", accounts, defaultAccountIdx)
    root.addView(accountSelect.container)

    val baseCategories = listOf(Option(null, "Sin categoría")) + readOptions(runtimeContext, "categories", fallbackLabel = "Sin categoría")
    val aiNewCategory = aiNewCategoryOption(aiCategoryRecommendation)
    val categories = if (aiNewCategory != null) baseCategories + aiNewCategory else baseCategories
    val categorySelect = categoryChipField(context, "CATEGORÍA (OPCIONAL)", categories, 0)
    root.addView(categorySelect.container)

    val aiSuggestedIdx = aiSuggestedCategoryIndex(aiCategoryRecommendation, categories)
    val suggestedIdx = aiSuggestedIdx ?: suggestCategoryForOverlay(description, runtimeContext, categories)
    val suggestedCategory = if (suggestedIdx != null && suggestedIdx > 0) categories.getOrNull(suggestedIdx) else null
    if (suggestedCategory != null && suggestedIdx != null) {
      val detail = if (aiSuggestedIdx != null) aiDetail(aiCategoryRecommendation) else "patrón de tus movimientos"
      val suggestionRow = categorySuggestionRow(context, suggestedCategory.label, detail) {
        categorySelect.selectIndex(suggestedIdx)
      }
      val suggestionWrap = LinearLayout(context).apply {
        orientation = LinearLayout.VERTICAL
        setPadding(0, dp(6), 0, 0)
      }
      suggestionWrap.addView(suggestionRow)
      root.addView(suggestionWrap)
    }

    val descriptionInput = field(
      context,
      "Descripción",
      description,
      InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE,
    )
    descriptionInput.input.minLines = 2
    root.addView(descriptionInput.container)

    val cancelBtn = actionButton(context, "Cancelar", false, dp(18)) { animatedDismiss() }

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
      setOnClickListener {
        val workspaceId = runtimeContext.optInt("workspaceId", 0).takeIf { it > 0 }
        val selectedAccountIdx = accountSelect.selectedIndex().coerceIn(0, accounts.lastIndex)
        val selectedCategoryIdx = categorySelect.selectedIndex().coerceIn(0, categories.lastIndex)
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
          categories[selectedCategoryIdx].id,
          categories[selectedCategoryIdx].createName,
          descriptionInput.input.text.toString(),
        )
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
    }
    container.addView(input)
    return FieldRefs(container, input)
  }

  private fun accountChipField(
    context: Context,
    label: String,
    options: List<Option>,
    defaultIndex: Int,
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
        setOnClickListener { currentIndex = index; refreshChips() }
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
    return SelectRefs(container, { currentIndex })
  }

  private fun categoryChipField(
    context: Context,
    label: String,
    options: List<Option>,
    defaultIndex: Int,
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
      chipViews.forEachIndexed { index, chip ->
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
    return SelectRefs(container, { currentIndex }, selectFn)
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
  )

  private data class Option(
    val id: Int?,
    val label: String,
    val meta: String? = null,
    val createName: String? = null,
  )

  private fun aiConfidence(recommendation: JSONObject?): Double {
    return recommendation?.optDouble("confidence", 0.0)?.takeIf { !it.isNaN() } ?: 0.0
  }

  private fun aiDetail(recommendation: JSONObject?): String {
    val confidence = (aiConfidence(recommendation) * 100).toInt().coerceIn(0, 100)
    val firstReason = recommendation?.optJSONArray("reasons")?.optString(0).orEmpty()
    return listOf("IA Pro · $confidence%", firstReason.ifBlank { null }).filterNotNull().joinToString(" · ")
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

  private fun aiNewCategoryOption(recommendation: JSONObject?): Option? {
    if (recommendation == null || recommendation.optString("type") != "new_category" || aiConfidence(recommendation) < 0.65) return null
    val newName = recommendation.optString("newCategoryName").trim().replace(Regex("\\s+"), " ")
    if (newName.length < 3) return null
    return Option(null, "Crear: $newName", "IA Pro", newName)
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
  ): Int? {
    if (description.isBlank()) return null
    val normalized = normalizeText(description)
    val words = normalized.split(" ").filter { it.length >= 3 }
    if (words.isEmpty()) return null

    // Tier 1: learningFeedback — Jaccard similarity ≥ 0.58
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
        if (sim >= 0.58 && sim > bestSim) {
          bestSim = sim
          bestCatId = fb.optInt("acceptedCategoryId", 0).takeIf { it > 0 }
        }
      }
      if (bestCatId != null) {
        val idx = categories.indexOfFirst { it.id == bestCatId }
        if (idx > 0) return idx
      }
    }

    // Tier 2: wordToCategory pattern map — cumulative word-frequency score
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
        val idx = categories.indexOfFirst { it.id == best.key }
        if (idx > 0) return idx
      }
    }

    return null
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
      setOnClickListener { onApply() }
    }
    row.addView(textCol, LinearLayout.LayoutParams(0, ViewGroup.LayoutParams.WRAP_CONTENT, 1f))
    row.addView(applyBtn, LinearLayout.LayoutParams(ViewGroup.LayoutParams.WRAP_CONTENT, ViewGroup.LayoutParams.WRAP_CONTENT).apply {
      leftMargin = dp(8)
    })
    return row
  }

  private fun defaultAccountIndex(runtimeContext: JSONObject, financialAppKey: String, accounts: List<Option>): Int {
    val settings = runtimeContext.optJSONArray("settings") ?: return 0
    for (index in 0 until settings.length()) {
      val setting = settings.optJSONObject(index) ?: continue
      if (setting.optString("financialAppKey") != financialAppKey) continue
      val accountId = setting.optInt("defaultAccountId", 0)
      val accountIndex = accounts.indexOfFirst { it.id == accountId }
      return if (accountIndex >= 0) accountIndex else 0
    }
    return 0
  }
}
