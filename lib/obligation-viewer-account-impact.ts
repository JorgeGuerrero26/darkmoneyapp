import { formatCurrency } from "../components/ui/AmountDisplay";
import { obligationEventCashDeltaSign } from "./obligation-viewer-labels";
import type {
  ObligationEventSummary,
  ObligationSummary,
  SharedObligationSummary,
} from "../types/domain";

export function ownerDefaultAccountId(
  obligation: ObligationSummary | SharedObligationSummary | null,
): number | null {
  if (!obligation || "viewerMode" in obligation) return null;
  return (obligation as ObligationSummary).settlementAccountId ?? null;
}

export function viewerEventAccountDelta(
  event: ObligationEventSummary | null,
  obligation: ObligationSummary | SharedObligationSummary | null,
): number {
  if (!event || !obligation) return 0;
  const sign = obligationEventCashDeltaSign(event.eventType, obligation.direction, true);
  return sign * event.amount;
}

export function obligationEventLaneLabel(eventType: string, paymentWord: string): string {
  if (eventType === "payment") return `Movimiento de ${paymentWord.toLowerCase()}`;
  if (eventType === "principal_increase" || eventType === "principal_decrease") return "Cambio de capital";
  if (eventType === "opening") return "Apertura";
  return "Ajuste";
}

export type ViewerEventAccountImpactCopy = {
  chipLabel: string;
  note: string;
  tone: "positive" | "negative" | "neutral";
};

export function viewerEventAccountImpactCopy(
  event: ObligationEventSummary | null,
  obligation: ObligationSummary | SharedObligationSummary | null,
  hasLinkedAccount: boolean,
): ViewerEventAccountImpactCopy | null {
  if (!event || !obligation) return null;
  if (
    event.eventType !== "payment" &&
    event.eventType !== "principal_increase" &&
    event.eventType !== "principal_decrease"
  ) {
    return null;
  }
  if (!hasLinkedAccount) {
    return {
      chipLabel: "Sin cuenta asociada",
      note: "Sin cuenta asociada, este evento solo cambia la obligación. Tus balances no se mueven todavía.",
      tone: "neutral",
    };
  }

  const delta = viewerEventAccountDelta(event, obligation);
  const amountLabel = `${delta >= 0 ? "+" : "-"}${formatCurrency(Math.abs(delta), obligation.currencyCode)}`;
  const isReceivable = obligation.direction === "receivable";

  if (event.eventType === "payment") {
    if (delta >= 0) {
      return {
        chipLabel: `En tu cuenta ${amountLabel}`,
        note: isReceivable
          ? "Como estás viendo la deuda desde el lado acreedor, este cobro se registra como entrada en tu cuenta."
          : "Como estás viendo el crédito desde el lado acreedor, este cobro se registra como entrada en tu cuenta.",
        tone: "positive",
      };
    }
    return {
      chipLabel: `En tu cuenta ${amountLabel}`,
      note: isReceivable
        ? "Como estás viendo el crédito desde el lado deudor, este pago se registra como salida en tu cuenta."
        : "Como estás viendo la deuda desde el lado deudor, este pago se registra como salida en tu cuenta.",
      tone: "negative",
    };
  }

  if (event.eventType === "principal_increase") {
    if (delta >= 0) {
      return {
        chipLabel: `En tu cuenta ${amountLabel}`,
        note: isReceivable
          ? "Este aumento de capital significa que recibiste más dinero prestado, por eso el sistema registra una entrada en tu cuenta."
          : "Este aumento de capital significa que recibiste más dinero para cubrir la deuda, por eso el sistema registra una entrada en tu cuenta.",
        tone: "positive",
      };
    }
    return {
      chipLabel: `En tu cuenta ${amountLabel}`,
      note: isReceivable
        ? "Este aumento de capital significa que prestaste más dinero, por eso el sistema registra una salida en tu cuenta."
        : "Este aumento de capital significa que prestaste más dinero al deudor, por eso el sistema registra una salida en tu cuenta.",
      tone: "negative",
    };
  }

  if (delta >= 0) {
    return {
      chipLabel: `En tu cuenta ${amountLabel}`,
      note: isReceivable
        ? "Esta reducción de capital te devolvió parte del principal, por eso el sistema registra una entrada en tu cuenta."
        : "Esta reducción de capital te devolvió parte del dinero pendiente, por eso el sistema registra una entrada en tu cuenta.",
      tone: "positive",
    };
  }
  return {
    chipLabel: `En tu cuenta ${amountLabel}`,
    note: isReceivable
      ? "Esta reducción de capital implica que devolviste parte del principal, por eso el sistema registra una salida en tu cuenta."
      : "Esta reducción de capital implica que devolviste parte del dinero recibido, por eso el sistema registra una salida en tu cuenta.",
    tone: "negative",
  };
}
