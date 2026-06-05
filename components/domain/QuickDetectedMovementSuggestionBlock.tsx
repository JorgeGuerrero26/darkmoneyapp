import { memo } from "react";
import { SmartSuggestion, SmartSuggestionEmpty, SmartSuggestionLoading } from "../ui/SmartSuggestion";

export type CategorySuggestionStateLike = {
  categoryName: string;
  detail?: string | null;
};

type Props = {
  loading: boolean;
  attempted: boolean;
  suggestion: CategorySuggestionStateLike | null;
  hasLocalSuggestion: boolean;
  /** Cuando la IA falló o no pudo correr (timeout/error edge). Distingue "no disponible" de "sin sugerencia". */
  errored?: boolean;
  onApply: () => void;
};

/**
 * Visual block that shows the AI category suggestion state (loading / empty / actionable).
 * Extracted from QuickDetectedMovementEntry so unrelated form-state changes (description
 * typing, amount edits, etc.) do not re-render this section.
 *
 * This is intentionally a thin presentational wrapper — all decision logic stays in the parent.
 */
function CategorySuggestionBlockComponent({ loading, attempted, suggestion, hasLocalSuggestion, errored, onApply }: Props) {
  if (loading) {
    return (
      <SmartSuggestionLoading
        detail={
          hasLocalSuggestion
            ? "Puede confirmar la sugerencia actual; si aparece una mejor, la actualizaremos."
            : "Buscando una categoría más precisa para este movimiento."
        }
      />
    );
  }
  // Si la IA falló y no hay nada que mostrar, ser transparente: "IA no disponible" (distinto de vacío).
  if (errored && !suggestion) {
    return <SmartSuggestionEmpty message="IA no disponible" />;
  }
  if (attempted && !suggestion) {
    return <SmartSuggestionEmpty message="IA sin sugerencia" />;
  }
  if (suggestion) {
    return (
      <SmartSuggestion
        label={suggestion.categoryName}
        detail={suggestion.detail ?? undefined}
        onApply={onApply}
      />
    );
  }
  return null;
}

export const CategorySuggestionBlock = memo(CategorySuggestionBlockComponent);
