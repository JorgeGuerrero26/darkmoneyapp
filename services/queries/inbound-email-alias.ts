import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

/**
 * Alias de correo entrante: el usuario crea un filtro en Gmail que reenvía los correos de
 * constancia del banco a esta dirección, y la edge function inbound-email-detection los
 * convierte en sugerencias pendientes de confirmación.
 *
 * El token es un SECRETO —quien lo conozca puede inyectar sugerencias— y por eso lo genera
 * Postgres con gen_random_uuid(), no el cliente: Math.random() en Hermes es predecible.
 * Es rotable para que filtrarlo no obligue a cambiar de cuenta de correo.
 */

export const INBOUND_EMAIL_DOMAIN = "darkmoney.company";

/**
 * Centinela que la edge function `inbound-email-detection` escribe en `package_name`, que es
 * NOT NULL y viene del mundo Android. Los dos puntos no son válidos en un package name, así
 * que nunca colisiona con una app real.
 *
 * El valor está duplicado en `supabase/functions/inbound-email-detection/index.ts`: son dos
 * despliegues distintos y no comparten módulos. Si cambia acá, cambiarlo allá.
 */
export const EMAIL_SOURCE_PACKAGE = "email:inbound";

export function inboundEmailAddress(token: string): string {
  return `recibos+${token}@${INBOUND_EMAIL_DOMAIN}`;
}

export function useInboundEmailAliasQuery(userId: string | null, workspaceId: number | null) {
  return useQuery({
    queryKey: ["inbound-email-alias", userId, workspaceId],
    enabled: Boolean(supabase && userId && workspaceId),
    queryFn: async () => {
      const { data, error } = await supabase!
        .from("inbound_email_aliases")
        .select("token")
        .eq("user_id", userId!)
        .eq("workspace_id", workspaceId!)
        .is("revoked_at", null)
        .maybeSingle();
      if (error) throw new Error(error.message);
      return (data?.token as string | undefined) ?? null;
    },
  });
}

/** Crea uno nuevo y revoca el anterior: se usa tanto para activar como para rotar. */
export function useRotateInboundEmailAliasMutation(
  userId: string | null,
  workspaceId: number | null,
) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      if (!supabase || !userId || !workspaceId) throw new Error("Sesión no disponible.");

      await supabase
        .from("inbound_email_aliases")
        .update({ revoked_at: new Date().toISOString() })
        .eq("user_id", userId)
        .eq("workspace_id", workspaceId)
        .is("revoked_at", null);

      // Sin `token`: lo pone el default de la tabla. El select lo trae de vuelta para poder
      // mostrarlo, porque es la única vez que el usuario necesita verlo completo.
      const { data, error } = await supabase
        .from("inbound_email_aliases")
        .insert({ user_id: userId, workspace_id: workspaceId })
        .select("token")
        .single();
      if (error) throw new Error(error.message);
      return data.token as string;
    },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["inbound-email-alias"] });
    },
  });
}
