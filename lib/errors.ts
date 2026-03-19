/**
 * Maps Supabase/PostgreSQL error codes and common error messages
 * to human-readable Spanish strings.
 */
export function humanizeError(err: unknown): string {
  // Supabase PostgrestError is not instanceof Error — extract message manually
  const msg: string =
    err instanceof Error
      ? (err.message ?? "")
      : typeof err === "object" && err !== null && "message" in err
        ? String((err as Record<string, unknown>).message ?? "")
        : typeof err === "string"
          ? err
          : "";

  if (!msg) return "Error desconocido";

  // Supabase PostgreSQL error codes (embedded in message)
  if (msg.includes("23505") || msg.includes("unique") || msg.includes("duplicate")) {
    if (msg.includes("email")) return "Ya existe una cuenta con ese correo";
    if (msg.includes("name") || msg.includes("nombre")) return "Ya existe un elemento con ese nombre";
    return "Ya existe un registro con esos datos";
  }
  if (msg.includes("23503") || msg.includes("foreign key")) {
    return "No se puede eliminar porque otros registros dependen de él";
  }
  if (msg.includes("23502") || msg.includes("not-null") || msg.includes("null value")) {
    return "Hay campos obligatorios vacíos";
  }
  if (msg.includes("22003") || msg.includes("numeric") || msg.includes("out of range")) {
    return "El monto ingresado es demasiado grande";
  }
  if (msg.includes("42501") || msg.includes("permission denied") || msg.includes("row-level security")) {
    return "No tienes permisos para realizar esta acción";
  }

  // Auth errors
  if (msg.includes("Invalid login credentials") || msg.includes("invalid_credentials")) {
    return "Correo o contraseña incorrectos";
  }
  if (msg.includes("Email not confirmed")) {
    return "Debes confirmar tu correo antes de ingresar";
  }
  if (msg.includes("User already registered") || msg.includes("already been registered")) {
    return "Ya existe una cuenta con ese correo";
  }
  if (msg.includes("Password should be")) {
    return "La contraseña debe tener al menos 6 caracteres";
  }
  if (msg.includes("rate limit") || msg.includes("too many requests")) {
    return "Demasiados intentos. Espera unos minutos e intenta de nuevo";
  }
  if (msg.includes("network") || msg.includes("fetch") || msg.includes("NetworkError") || msg.includes("Failed to fetch")) {
    return "Sin conexión. Revisa tu internet e intenta de nuevo";
  }
  if (msg.includes("JWT") || msg.includes("session") || msg.includes("token")) {
    return "Tu sesión expiró. Vuelve a iniciar sesión";
  }
  if (msg.includes("Storage") || msg.includes("upload") || msg.includes("bucket")) {
    return "Error al subir el archivo. Intenta de nuevo";
  }
  if (msg.includes("timeout") || msg.includes("aborted")) {
    return "La solicitud tardó demasiado. Intenta de nuevo";
  }

  // Edge function errors — often return { message: "..." } wrapped
  if (msg.includes("User not found") || msg.includes("not found")) {
    return "No se encontró el recurso solicitado";
  }
  if (msg.includes("already exists") || msg.includes("ya existe")) {
    return "Este elemento ya existe";
  }

  // Fallback: return original if it looks user-friendly (short, no stack traces)
  if (msg.length < 120 && !msg.includes("at ") && !msg.includes("Object.")) {
    return msg;
  }

  return "Ocurrió un error inesperado. Intenta de nuevo";
}
