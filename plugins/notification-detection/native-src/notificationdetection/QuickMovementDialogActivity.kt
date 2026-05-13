package com.darkmoney.app.notificationdetection

import android.app.Activity
import android.app.NotificationManager
import android.graphics.Color
import android.graphics.drawable.ColorDrawable
import android.os.Bundle
import android.text.InputType
import android.view.Gravity
import android.view.ViewGroup
import android.view.Window
import android.view.WindowManager
import android.widget.EditText
import android.widget.LinearLayout
import android.widget.RadioButton
import android.widget.RadioGroup
import android.widget.ScrollView
import android.widget.TextView
import android.widget.Button
import com.darkmoney.app.R

class QuickMovementDialogActivity : Activity() {
  private var suggestionId: String = ""
  private var notificationId: Int = 0

  override fun onCreate(savedInstanceState: Bundle?) {
    super.onCreate(savedInstanceState)
    overridePendingTransition(0, 0)
    requestWindowFeature(Window.FEATURE_NO_TITLE)
    setFinishOnTouchOutside(true)
    window.setBackgroundDrawable(ColorDrawable(Color.TRANSPARENT))
    window.setGravity(Gravity.CENTER)
    window.setDimAmount(0.42f)
    window.attributes = window.attributes.apply {
      windowAnimations = 0
    }
    window.addFlags(WindowManager.LayoutParams.FLAG_DIM_BEHIND)

    suggestionId = intent.getStringExtra(EXTRA_SUGGESTION_ID).orEmpty()
    notificationId = intent.getIntExtra(EXTRA_NOTIFICATION_ID, 0)
    val suggestion = NotificationDetectionStore.getSuggestion(this, suggestionId)

    val appName = suggestion?.optString("appName").orEmpty().ifBlank { "App financiera" }
    val amount = suggestion?.optString("amountLabel").orEmpty().replace(Regex("[^0-9.,]"), "")
    val description = suggestion?.optString("text").orEmpty().ifBlank {
      suggestion?.optString("title").orEmpty()
    }
    val movementType = suggestion?.optString("movementType").orEmpty()

    setContentView(buildContent(appName, amount, description, movementType))
  }

  override fun finish() {
    super.finish()
    overridePendingTransition(0, 0)
  }

  private fun buildContent(
    appName: String,
    amount: String,
    description: String,
    movementType: String,
  ): ScrollView {
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val root = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(dp(22), dp(20), dp(22), dp(18))
      setBackgroundResource(R.drawable.quick_movement_dialog_bg)
    }

    root.addView(TextView(this).apply {
      text = "Registrar movimiento"
      textSize = 21f
      setTextColor(0xFFF5F7FB.toInt())
      typeface = android.graphics.Typeface.DEFAULT_BOLD
    })

    root.addView(TextView(this).apply {
      text = appName
      textSize = 14f
      setTextColor(0xFF96A2B5.toInt())
      setPadding(0, dp(4), 0, dp(14))
    })

    val amountInput = field("Monto", amount, InputType.TYPE_CLASS_NUMBER or InputType.TYPE_NUMBER_FLAG_DECIMAL)
    root.addView(amountInput.container)

    root.addView(TextView(this).apply {
      text = "Tipo"
      textSize = 12f
      setTextColor(0xFF96A2B5.toInt())
      setPadding(0, dp(12), 0, dp(6))
    })

    val typeGroup = RadioGroup(this).apply {
      orientation = RadioGroup.HORIZONTAL
      gravity = Gravity.CENTER
    }
    val expense = RadioButton(this).apply {
      id = 1001
      text = "Gasto"
      textSize = 14f
      setTextColor(0xFFF5F7FB.toInt())
    }
    val income = RadioButton(this).apply {
      id = 1002
      text = "Ingreso"
      textSize = 14f
      setTextColor(0xFFF5F7FB.toInt())
    }
    typeGroup.addView(expense)
    typeGroup.addView(income)
    typeGroup.check(if (movementType == "income") income.id else expense.id)
    root.addView(typeGroup)

    val accountInput = field("Cuenta", appName, InputType.TYPE_CLASS_TEXT)
    root.addView(accountInput.container)

    val categoryInput = field("Categoría", "Sin categoría", InputType.TYPE_CLASS_TEXT)
    root.addView(categoryInput.container)

    val descriptionInput = field("Descripción", description, InputType.TYPE_CLASS_TEXT or InputType.TYPE_TEXT_FLAG_MULTI_LINE)
    descriptionInput.input.minLines = 2
    root.addView(descriptionInput.container)

    val actions = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(16), 0, 0)
    }

    actions.addView(Button(this).apply {
      text = "Simular guardar"
      setOnClickListener {
        NotificationDetectionStore.markStatus(this@QuickMovementDialogActivity, suggestionId, "registered")
        if (notificationId > 0) {
          getSystemService(NotificationManager::class.java).cancel(notificationId)
        }
        finish()
      }
    })

    actions.addView(Button(this).apply {
      text = "Cancelar"
      setOnClickListener { finish() }
    })
    root.addView(actions)

    return ScrollView(this).apply {
      setPadding(dp(14), dp(14), dp(14), dp(14))
      addView(root, ViewGroup.LayoutParams(ViewGroup.LayoutParams.MATCH_PARENT, ViewGroup.LayoutParams.WRAP_CONTENT))
    }
  }

  private fun field(label: String, value: String, inputTypeValue: Int): FieldRefs {
    val density = resources.displayMetrics.density
    fun dp(value: Int) = (value * density).toInt()

    val container = LinearLayout(this).apply {
      orientation = LinearLayout.VERTICAL
      setPadding(0, dp(10), 0, 0)
    }
    container.addView(TextView(this).apply {
      text = label
      textSize = 12f
      setTextColor(0xFF96A2B5.toInt())
      setPadding(0, 0, 0, dp(6))
    })
    val input = EditText(this).apply {
      setText(value)
      inputType = inputTypeValue
      textSize = 16f
      setTextColor(0xFFF5F7FB.toInt())
      setHintTextColor(0xFF96A2B5.toInt())
      setSingleLine(inputTypeValue and InputType.TYPE_TEXT_FLAG_MULTI_LINE == 0)
      setPadding(dp(12), dp(8), dp(12), dp(8))
      setBackgroundResource(R.drawable.quick_movement_input_bg)
    }
    container.addView(input)
    return FieldRefs(container, input)
  }

  private data class FieldRefs(
    val container: LinearLayout,
    val input: EditText,
  )

  companion object {
    const val EXTRA_SUGGESTION_ID = "suggestionId"
    const val EXTRA_NOTIFICATION_ID = "notificationId"
  }
}
