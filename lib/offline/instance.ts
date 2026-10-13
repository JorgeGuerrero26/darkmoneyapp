import { databaseNameFor, deleteExpoDatabase, isSqliteAvailable, openExpoDriver } from "./expo-driver";
import { OfflineRuntime } from "./runtime";
import { supabaseSyncTransport } from "./supabase-transport";

/**
 * Única instancia del runtime offline de la app. Las piezas de plataforma entran aquí; la lógica
 * vive en OfflineRuntime, que se prueba sin teléfono.
 */
export const offlineRuntime = new OfflineRuntime({
  isAvailable: isSqliteAvailable,
  openDriver: (userId) => openExpoDriver(databaseNameFor(userId)),
  deleteDatabase: (userId) => deleteExpoDatabase(databaseNameFor(userId)),
  transport: supabaseSyncTransport,
});
