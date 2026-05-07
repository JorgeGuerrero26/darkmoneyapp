import { QueryClient } from "@tanstack/react-query";

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
});
