import { useQuery } from "@tanstack/react-query";
import { supabase } from "../../lib/supabase";

/** El servidor resuelve el plan vigente; no usa overrides visuales ni el modo del dashboard. */
export async function fetchEmailDetectionProAccess(): Promise<boolean> {
  if (!supabase) throw new Error("Sesión no disponible.");
  const { data, error } = await supabase.rpc("has_email_detection_pro_access");
  if (error) throw new Error("No se pudo verificar tu acceso PRO. Reintenta.");
  return data === true;
}

export async function assertEmailDetectionProAccess(): Promise<void> {
  if (!(await fetchEmailDetectionProAccess())) {
    throw new Error("La detección por correo requiere DarkMoney PRO activo.");
  }
}

export function useEmailDetectionProAccessQuery(userId: string | null, enabled = true) {
  return useQuery({
    queryKey: ["email-detection-pro-access", userId],
    enabled: Boolean(supabase && userId && enabled),
    queryFn: fetchEmailDetectionProAccess,
    staleTime: 0,
    refetchInterval: enabled ? 60_000 : false,
  });
}
