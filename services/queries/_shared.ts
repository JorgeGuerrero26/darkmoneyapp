// Helpers internos compartidos entre archivos de queries divididos desde
// workspace-data.ts. NO exponer en el barrel: son utilities, no API pública.

import type { QueryClient } from "@tanstack/react-query";
import { InteractionManager } from "react-native";

import { useUiStore } from "../../store/ui-store";

export type BackgroundRefreshNotice = {
  message: string;
  description?: string;
};

const DEFAULT_BACKGROUND_REFRESH_NOTICE: BackgroundRefreshNotice = {
  message: "Actualizando datos",
  description: "Puedes seguir usando la app mientras sincronizamos balances y listados.",
};

export function runBackgroundQueryRefresh(
  queryClient: QueryClient,
  queryKeys: Array<readonly unknown[]>,
  notice: BackgroundRefreshNotice = DEFAULT_BACKGROUND_REFRESH_NOTICE,
) {
  let noticeId: string | null = null;
  const showTimer = setTimeout(() => {
    noticeId = useUiStore.getState().showActivityNotice(notice.message, notice.description);
  }, 220);

  InteractionManager.runAfterInteractions(() => {
    void Promise.all(queryKeys.map((queryKey) => queryClient.invalidateQueries({ queryKey })))
      .catch(() => undefined)
      .finally(() => {
        clearTimeout(showTimer);
        if (noticeId) {
          useUiStore.getState().dismissActivityNotice(noticeId);
        }
      });
  });
}

export type NumericLike = number | string | null;

export function toNum(val: NumericLike): number {
  if (val === null || val === undefined) return 0;
  const n = Number(val);
  return isNaN(n) ? 0 : n;
}

export function formatSupabaseError(error: {
  code?: string | null;
  message?: string | null;
  details?: string | null;
  hint?: string | null;
}) {
  return [error.code, error.message, error.details, error.hint]
    .filter((part): part is string => Boolean(part && part.trim()))
    .join(" | ");
}
