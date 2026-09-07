import { isAuthLikeError } from "./auth-error";

/**
 * Repite UNA vez un guardado que el servidor rechazó porque la sesión estaba a medio renovar.
 *
 * **El caso.** Al abrir la app, supabase-js renueva el token en segundo plano. Si guardas dentro
 * de esa ventana, Postgres rechaza la escritura por RLS (`42501`) y el formulario te pide que
 * vuelvas a tocar Guardar. Funciona —para cuando lo tocas, el token ya está fresco—, pero es la
 * app pidiéndole al usuario que haga a mano el reintento que sabe hacer sola. Medido en
 * `app_error_logs`: los cuatro fallos de `create-movement` por RLS del último trimestre caen
 * todos dentro de los tres minutos siguientes a un arranque (2026-07-15, 07-29, 09-05 y 09-06).
 *
 * **Por qué solo una vez.** Si tras renovar el token sigue rechazando, ya no es la ventana de
 * arranque: es un permiso que de verdad no tienes, y insistir solo retrasa el aviso.
 *
 * **Por qué hace falta renovar antes de repetir.** Sin eso el segundo intento sale con el mismo
 * token caducado y falla igual. `recover` es la renovación, y se pasa desde fuera para que este
 * módulo no arrastre el cliente de queries a un test unitario.
 *
 * **Y por qué NO se aplica a todo.** Repetir una operación exige que hacerla dos veces dé lo
 * mismo que hacerla una. Vale para editar (se manda el registro entero) y para crear un
 * movimiento (lleva clave de dedupe: el segundo intento recupera la fila del primero en vez de
 * duplicarla). Un contador que suma, un envío de correo o un pago no cumplen eso, así que se
 * envuelve caso por caso y nunca de forma global.
 */
export async function retryOnceIfSessionStale<T>(
  run: () => Promise<T>,
  recover: () => Promise<unknown>,
  /**
   * Se avisa cuando el segundo intento sale bien.
   *
   * Sin esto el arreglo se tapa a sí mismo: al no fallar ya nada, el registro de errores deja de
   * anotarlo y la ventana de arranque vuelve a ser invisible — que es exactamente lo que costó
   * meses atar. Un aviso por reintento logrado deja medir si esto pasa una vez al mes o veinte
   * veces al día, que es otra conversación (calentar la sesión antes de habilitar Guardar).
   */
  onRetried?: (message: string) => void,
): Promise<T> {
  try {
    return await run();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (!isAuthLikeError(message)) throw error;
    try {
      await recover();
    } catch {
      // Si la renovación falla, el error que vale es el de guardar, no el de renovar: es el que
      // explica lo que el usuario acaba de intentar.
      throw error;
    }
    const result = await run();
    onRetried?.(message);
    return result;
  }
}
