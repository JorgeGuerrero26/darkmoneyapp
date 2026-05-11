import { MutationCache, QueryCache, QueryClient } from "@tanstack/react-query";

import { logError, logWarn } from "./error-logger";

/** Instancia única: permite limpiar caché al cambiar de usuario (p. ej. desde auth). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 120_000,
      retry: 1,
      refetchOnWindowFocus: false,
      placeholderData: (previousData: unknown) => previousData,
    },
  },
  queryCache: new QueryCache({
    onError: (error, query) => {
      logWarn("query", error instanceof Error ? error.message : String(error), {
        queryKey: query.queryKey,
      });
    },
  }),
  mutationCache: new MutationCache({
    onError: (error, _vars, _ctx, mutation) => {
      logError("mutation", error instanceof Error ? error.message : String(error), {
        mutationKey: mutation.options.mutationKey,
      });
    },
  }),
});
