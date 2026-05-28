/**
 * Strings del módulo movements centralizadas para preparar i18n futuro.
 * Patrón: cuando se introduzca i18n real (i18next, lingui, etc.), reemplazar
 * las constantes por llamadas a `t(...)` sin tocar el render.
 *
 * Hoy: monolingüe (es-PE).
 */

export const MOVEMENT_LABELS = {
  // --- Tipos y estados ---
  type: {
    expense: "Gasto",
    income: "Ingreso",
    transfer: "Transferencia",
    subscription_payment: "Suscripción",
    obligation_opening: "Apertura obligación",
    obligation_payment: "Pago obligación",
    refund: "Devolución",
    adjustment: "Ajuste",
  } as Record<string, string>,
  status: {
    posted: "Confirmado",
    pending: "Pendiente",
    planned: "Planificado",
    voided: "Anulado",
  } as Record<string, string>,

  // --- Form ---
  form: {
    title: {
      create: "Nuevo movimiento",
      edit: "Editar movimiento",
    },
    section: {
      type: "Tipo",
      status: "Estado",
    },
    field: {
      amount: "Monto",
      amountSource: "Monto origen",
      amountDestination: "Monto destino",
      sourceAccount: "Cuenta origen",
      destinationAccount: "Cuenta destino",
      account: "Cuenta",
      description: "Descripción (opcional)",
      descriptionPlaceholder: "Se genera automáticamente si la dejas vacía",
      category: "Categoría (opcional)",
      counterparty: "Contraparte (opcional)",
      date: "Fecha",
      notes: "Notas (opcional)",
      notesPlaceholder: "Notas adicionales…",
      fxRate: "Tipo de cambio",
    },
    error: {
      amountRequired: "Ingresa un monto",
      amountPositive: "El monto debe ser mayor a 0",
      sourceAccountRequired: "Selecciona una cuenta",
      destinationAccountRequiredIncome: "Selecciona una cuenta de destino",
      destinationAccountRequiredTransfer: "Selecciona cuenta destino",
      transferSameAccount: "Debe ser una cuenta diferente",
      transferFxUnresolved: "No se pudo resolver el tipo de cambio",
      transferDestAmountRequired: "Ingresa monto destino",
    },
    warning: {
      futureDate: "La fecha del movimiento es futura",
      overdraft: "El monto supera el saldo disponible de la cuenta",
    },
    button: {
      next: "Siguiente →",
      back: "← Atrás",
      save: "Guardar",
      saving: "Guardando…",
      cancel: "Cancelar",
    },
    fxNote: {
      manual: "Usaremos esta tasa solo para este movimiento.",
      apiPrefix: "Actualizado con",
      cachedFallback: "No se pudo actualizar en línea; usamos el tipo de cambio guardado.",
      pending: "Actualizando desde la API...",
    },
    transferSameCurrencyNote: (currency: string) =>
      `Misma moneda (${currency}) · el monto se transfiere igual.`,
  },

  // --- Lista ---
  list: {
    title: "Movimientos",
    titleSelected: (count: number) => `${count} seleccionados`,
    empty: {
      title: "Sin movimientos",
      description: "Registra tu primer movimiento con el botón +",
      action: "Nuevo movimiento",
    },
    noResults: {
      title: "Sin resultados",
      description: "Prueba cambiando los filtros aplicados.",
    },
    summary: {
      income: "Ingresos",
      expense: "Gastos",
      net: "neto",
      partial: "parcial ↓",
      helpIncome: "Total de movimientos de ingreso que coinciden con la búsqueda y filtros actuales.",
      helpExpense: "Total de movimientos de gasto que coinciden con la búsqueda y filtros actuales.",
      helpNet: "Diferencia entre ingresos y gastos visibles. Si es positivo entró más dinero; si es negativo salió más dinero.",
    },
    filters: {
      open: "Abrir filtros avanzados",
      reset: "Limpiar todos",
      apply: "Aplicar",
      searchPlaceholder: "Buscar movimientos...",
      amountRange: "Rango de monto",
      amountMin: "Mínimo",
      amountMax: "Máximo",
    },
    bulk: {
      selectAll: "Sel. todos",
      cancelSelection: "Cancelar selección",
      exportCsv: "CSV",
      delete: "Eliminar",
      deleted: (count: number) => `${count} movimiento${count === 1 ? "" : "s"} eliminado${count === 1 ? "" : "s"}`,
    },
    quickAdd: {
      title: "Registrar rápido",
      expense: "+ Gasto",
      income: "+ Ingreso",
      transfer: "+ Transferencia",
    },
    dateLabel: {
      today: "Hoy",
      yesterday: "Ayer",
    },
  },

  // --- Detalle ---
  detail: {
    sectionTitle: {
      details: "Detalles",
      attachments: "Comprobantes",
      transfer: "Transferencia",
      origin: "Origen",
      history: "Historial",
    },
    field: {
      type: "Tipo",
      status: "Estado",
      date: "Fecha",
      description: "Descripción",
      category: "Categoría",
      counterparty: "Contacto",
      notes: "Notas",
      account: "Cuenta",
      sourceAccount: "Origen",
      destinationAccount: "Destino",
      fxRate: "Tipo de cambio",
      createdAt: "Creado",
      updatedAt: "Actualizado",
      voidedAt: "Anulado",
      bySystem: "Sistema",
      byUserPrefix: "por",
    },
    actions: {
      edit: "Editar",
      duplicate: "Duplicar",
      void: "Anular",
      voiding: "Anulando…",
      linkObligation: "+ Asociar a crédito / deuda",
      linking: "Vinculando...",
    },
    attachments: {
      empty: "Este movimiento no tiene comprobantes visibles todavía.",
      loading: "Cargando comprobantes...",
      countSuffix: (n: number) => `${n} adjunto${n === 1 ? "" : "s"}`,
      noAttachments: "Sin adjuntos",
      selectedSuffix: (n: number) => `${n} seleccionado${n === 1 ? "" : "s"}`,
    },
    readOnly: {
      obligationOpening: "Este movimiento se crea automáticamente al registrar una obligación. No es editable.",
      obligationPayment: "Este movimiento refleja un pago de obligación. Edítalo desde la obligación.",
    },
  },
};

/**
 * Devuelve el label legible de un tipo de movimiento. Fallback al string raw
 * si el tipo no está en el mapa (compat con tipos custom futuros).
 */
export function movementTypeLabel(type: string): string {
  return MOVEMENT_LABELS.type[type] ?? type;
}

export function movementStatusLabel(status: string): string {
  return MOVEMENT_LABELS.status[status] ?? status;
}
