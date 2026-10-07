export type PushRegistrationReason =
  | "not_device"
  | "expo_go"
  | "module_unavailable"
  | "permissions_denied"
  | "native_configuration"
  | "network_error"
  | "service_error"
  | "timeout"
  | "registration_error";

export type PushRegistrationResult =
  | { ok: true; token: string }
  | { ok: false; reason: PushRegistrationReason; detail?: string };

export function classifyPushRegistrationError(error: unknown): Extract<PushRegistrationResult, { ok: false }> {
  const detail = typeof error === "object" && error !== null && "message" in error
    ? String(error.message)
    : String(error ?? "");
  const code = typeof error === "object" && error !== null && "code" in error
    ? String(error.code)
    : "";
  let reason: PushRegistrationReason = "registration_error";
  // Signing errors can mention network/registration too. Identify them first.
  if (/aps-environment|push notifications.*capability|fcm.*(?:config|initializ)|default firebaseapp/i.test(detail)
    || ["ERR_NOTIFICATIONS_NO_EXPERIENCE_ID", "ERR_NOTIFICATIONS_NO_APPLICATION_ID"].includes(code)) {
    reason = "native_configuration";
  } else if (code === "ERR_PUSH_REGISTRATION_TIMEOUT") {
    reason = "timeout";
  } else if (code === "ERR_NOTIFICATIONS_SERVER_ERROR") {
    reason = "service_error";
  } else if (code === "ERR_NOTIFICATIONS_NETWORK_ERROR" || /network request failed|network error|failed to fetch|internet connection.*offline/i.test(detail)) {
    reason = "network_error";
  }
  return { ok: false, reason, detail };
}

export function pushRegistrationMessage(reason: PushRegistrationReason): { title: string; description: string } {
  switch (reason) {
    case "native_configuration":
      return {
        title: "Esta instalación no permite recibir avisos",
        description: "Para recibirlos, necesitas una instalación compatible de DarkMoney. En iPhone, una instalación con Apple ID gratuito no permite estos avisos.",
      };
    case "permissions_denied":
      return { title: "Permisos bloqueados en el sistema", description: "Permite las notificaciones de DarkMoney en los ajustes del sistema y vuelve a activar el interruptor." };
    case "network_error":
      return { title: "No se pudo conectar al servicio de notificaciones", description: "Revisa tu conexión e inténtalo de nuevo. La conexión con este servicio puede fallar aunque otras aplicaciones funcionen." };
    case "service_error":
      return { title: "El servicio de notificaciones no respondió correctamente", description: "Inténtalo más tarde. Los avisos todavía no se han activado." };
    case "timeout":
      return { title: "La activación está tardando demasiado", description: "No pudimos confirmar el registro del teléfono. Puedes intentarlo de nuevo más tarde." };
    case "expo_go":
    case "not_device":
    case "module_unavailable":
      return { title: "Los avisos no están disponibles en esta instalación", description: "Necesitas una versión compatible de DarkMoney para recibir avisos en tu teléfono." };
    default:
      return { title: "No se pudieron activar los avisos en este teléfono", description: "El teléfono no pudo completar la activación. Inténtalo de nuevo más tarde." };
  }
}
