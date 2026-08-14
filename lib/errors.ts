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
    // En producción (app_error_logs) este error aparece cuando el token expiró justo
    // al escribir (app recién resucitada, refresh en vuelo): el reintento funciona.
    return "Tu sesión se estaba renovando al guardar. Inténtalo de nuevo.";
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
  if (lowerMsg.includes("timeout") || lowerMsg.includes("aborted") || lowerMsg.includes("tiempo de espera")) {
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

/**
 * Mensaje TÉCNICO para logs (no para el usuario: eso es `humanizeError`).
 *
 * Los errores de Supabase NO son instancias de `Error`, son objetos planos
 * `{ message, details, hint, code }`. Con `String(error)` salían como el literal
 * "[object Object]": 37 registros en 21 días completamente ilegibles.
 *
 * Y no era solo cosmético. `isAuthLikeError("[object Object]")` es `false`, así que la
 * recuperación de sesión NO se disparaba para ninguno de ellos; si alguno era un token
 * vencido o un 42501, la app se quedaba mirando.
 */
export function errorLogMessage(err: unknown): string {
  if (err instanceof Error) return err.message || err.name || "Error sin mensaje";
  if (typeof err === "string") return err;
  if (typeof err === "object" && err !== null) {
    const e = err as Record<string, unknown>;
    // El código va delante: isAuthLikeError busca 42501 y compañía.
    const parts = [e.code, e.message, e.details, e.hint]
      .filter((p) => typeof p === "string" && p.trim().length > 0)
      .map(String);
    if (parts.length) return parts.join(" | ");
    try {
      const json = JSON.stringify(err);
      if (json && json !== "{}") return json.slice(0, 300);
    } catch {
      /* referencias circulares: cae al genérico de abajo */
    }
  }
  return String(err);
}
