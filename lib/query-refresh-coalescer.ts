import type { QueryClient, QueryKey } from "@tanstack/react-query";

const pendingInvalidations = new WeakMap<
  QueryClient,
  Map<string, ReturnType<typeof setTimeout>>
>();
const pendingTasks = new WeakMap<object, Map<string, ReturnType<typeof setTimeout>>>();

function timersFor<T extends object>(
  registry: WeakMap<T, Map<string, ReturnType<typeof setTimeout>>>,
  owner: T,
): Map<string, ReturnType<typeof setTimeout>> {
  const current = registry.get(owner);
  if (current) return current;
  const created = new Map<string, ReturnType<typeof setTimeout>>();
  registry.set(owner, created);
  return created;
}

/**
 * Agrupa invalidaciones iguales que llegan en ráfaga (p. ej. volver a la app y un push). La invalidación
 * conserva el comportamiento autoritativo de React Query: si había una refetch anterior que pudo
 * empezar antes del evento, se reemplaza para no aceptar una respuesta ya obsoleta.
 */
export function scheduleQueryInvalidation(
  queryClient: QueryClient,
  queryKey: QueryKey,
  delayMs = 200,
): void {
  const key = JSON.stringify(queryKey);
  const timers = timersFor(pendingInvalidations, queryClient);
  const previous = timers.get(key);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(() => {
    timers.delete(key);
    void queryClient.invalidateQueries({ queryKey });
  }, delayMs);
  timers.set(key, timer);
}

/** Ejecuta una sola tarea trailing para una ráfaga (p. ej. refresco selectivo del snapshot). */
export function scheduleCoalescedTask(
  owner: object,
  key: string,
  task: () => void | Promise<void>,
  delayMs = 200,
): void {
  const timers = timersFor(pendingTasks, owner);
  const previous = timers.get(key);
  if (previous) clearTimeout(previous);

  const timer = setTimeout(() => {
    timers.delete(key);
    void task();
  }, delayMs);
  timers.set(key, timer);
}
