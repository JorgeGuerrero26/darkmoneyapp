import { memo } from "react";
import { SmartSuggestion } from "../ui/SmartSuggestion";

export type CategorySuggestionStateLike = {
  categoryName: string;
  detail?: string | null;
};

type Props = {
  suggestion: CategorySuggestionStateLike | null;
  onApply: () => void;
};

/**
 * La sugerencia de categoría del movimiento detectado.
 *
 * Solo pinta cuando hay algo que proponer: anunciar que se está buscando, o decir que no se
 * encontró nada, ocupa sitio sin que el usuario pueda hacer nada con ello.
 *
 * Envoltura presentacional a propósito: la decisión vive en el padre.
 */
function CategorySuggestionBlockComponent({ suggestion, onApply }: Props) {
  if (!suggestion) return null;
  return (
    <SmartSuggestion
      label={suggestion.categoryName}
      detail={suggestion.detail ?? undefined}
      onApply={onApply}
    />
  );
}

export const CategorySuggestionBlock = memo(CategorySuggestionBlockComponent);
