/**
 * Maps Supabase/PostgreSQL error codes and common error messages
 * to human-readable Spanish strings.
 */
export function humanizeError(err: unknown): string {
  const msg: string =
    err instanceof Error
      ? (err.message ?? "")
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as Record<string, unknown>).message ?? "")
        : typeof err === "string"
          ? err
          : "";

  if (!msg) return "Error desconocido";
  const lowerMsg = msg.toLowerCase();

  if (msg.includes("23505") || lowerMsg.includes("unique") || lowerMsg.includes("duplicate")) {
    if (lowerMsg.includes("email")) return "Ya existe una cuenta con ese correo";
    if (lowerMsg.includes("name") || lowerMsg.includes("nombre")) return "Ya existe un elemento con ese nombre";
    return "Ya existe un registro con esos datos";
  }
  if (msg.includes("23503") || lowerMsg.includes("foreign key")) {
    return "No se puede eliminar porque otros registros dependen de él";
  }
  if (msg.includes("23502") || lowerMsg.includes("not-null") || lowerMsg.includes("null value")) {
    const column = msg.match(/column ["']?([a-z0-9_]+)["']?/i)?.[1]?.toLowerCase();
    switch (column) {
      case "title":
        return "El título es obligatorio";
      case "principal_amount":
      case "amount":
        return "Ingresa un monto válido";
      case "payment_date":
      case "event_date":
      case "start_date":
      case "due_date":
        return "Selecciona una fecha válida";
      case "currency_code":
        return "Selecciona una moneda";
      case "counterparty_id":
        return "Selecciona un contacto";
      case "settlement_account_id":
        return "Selecciona una cuenta de liquidación";
      case "origin_type":
        return "Selecciona cómo nació esta obligación";
      case "direction":
        return "Selecciona si te deben o debes";
      case "requested_by_user_id":
      case "created_by_user_id":
      case "updated_by_user_id":
      case "user_id":
        return "Tu sesión expiró. Vuelve a iniciar sesión";
      case "workspace_id":
        return "No se encontró el workspace activo";
      case "obligation_id":
        return "No se encontró la obligación";
      case "share_id":
        return "No se encontró la relación compartida";
      default:
        break;
    }
    return "Hay campos obligatorios vacíos";
  }
  if (msg.includes("22003") || lowerMsg.includes("numeric") || lowerMsg.includes("out of range")) {
    return "El monto ingresado es demasiado grande";
  }
  if (msg.includes("42501") || lowerMsg.includes("permission denied") || lowerMsg.includes("row-level security")) {
    return "No tienes permisos para realizar esta acción";
  }

  if (msg.includes("Invalid login credentials") || lowerMsg.includes("invalid_credentials")) {
    return "Correo o contraseña incorrectos";
  }
  if (msg.includes("Email not confirmed")) {
    return "Debes confirmar tu correo antes de ingresar";
  }
  if (msg.includes("User already registered") || lowerMsg.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo";
  }
  if (msg.includes("Password should be")) {
    return "La contraseña debe tener al menos 6 caracteres";
  }
  if (lowerMsg.includes("rate limit") || lowerMsg.includes("too many requests")) {
    return "Demasiados intentos. Espera unos minutos e intenta de nuevo";
  }
  if (lowerMsg.includes("network") || lowerMsg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
    return "Sin conexión. Revisa tu internet e intenta de nuevo";
  }
  if (lowerMsg.includes("invalid jwt")) {
    return "La Edge Function rechazó el JWT actual. Revisa la sesión activa o la configuración verify_jwt de esa función.";
  }
  if (msg.includes("JWT") || lowerMsg.includes("session") || lowerMsg.includes("token")) {
    return "Tu sesión expiró. Vuelve a iniciar sesión";
  }
  if (msg.includes("Storage") || lowerMsg.includes("upload") || lowerMsg.includes("bucket")) {
    return "Error al subir el archivo. Intenta de nuevo";
  }
  if (lowerMsg.includes("timeout") || lowerMsg.includes("aborted")) {
    return "La solicitud tardó demasiado. Intenta de nuevo";
  }

  if (msg.includes("User not found") || lowerMsg.includes("not found")) {
    return "No se encontró el recurso solicitado";
  }
  if (lowerMsg.includes("already exists") || lowerMsg.includes("ya existe")) {
    return "Este elemento ya existe";
  }

  if (msg.length < 120 && !msg.includes("at ") && !msg.includes("Object.")) {
    return msg;
  }

  return "Ocurrió un error inesperado. Intenta de nuevo";
}
