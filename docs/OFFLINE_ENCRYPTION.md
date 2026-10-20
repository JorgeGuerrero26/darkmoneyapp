# Cifrado de la copia local (modo sin conexión)

Estado: **código listo (JS, ya publicado por OTA) y configuración nativa preparada en `app.json` (versión 1.2.0)**. El cifrado se activa
en cada teléfono cuando instala un binario 1.2.0 (APK o IPA) compilado con esta configuración.

## Qué protege

La copia local del modo sin conexión (`darkmoney-offline-<usuario>.db`) guarda movimientos, cuentas, deudas y la cola de cambios sin
enviar. Con el cifrado, el archivo es ilegible sin una llave aleatoria de 256 bits que vive **solo en el llavero del teléfono**
(iOS Keychain / Android Keystore, `expo-secure-store`, acceso «después del primer desbloqueo» y «solo este dispositivo»).
Quien copie el archivo (copia de seguridad, teléfono perdido sin desbloquear, herramientas forenses) no puede leerlo sin el llavero.

## Cómo funciona

- `lib/offline/db-key.ts`: crea y guarda la llave por usuario (`expo-crypto` para la aleatoriedad). Se borra al cerrar sesión.
- `lib/offline/expo-driver.ts`: abre `darkmoney-offline-enc-<usuario>.db` con `PRAGMA key = "x'<llave>'"`. Detecta SQLCipher con
  `PRAGMA cipher_version`: **un binario sin SQLCipher abre la base de siempre, sin cifrar** (el mismo JS sirve para los dos).
- **Migración automática** de la base sin cifrar a la cifrada (`lib/offline/db-copy.ts`): copia esquema, filas, índices y la **cola de
  cambios sin enviar**, en una sola transacción; `user_version` se escribe al final, así que si se corta a medias se repite desde cero.
  Solo cuando la copia terminó se borra la base sin cifrar.
- Si el llavero no se puede leer (teléfono recién reiniciado y sin desbloquear), el motor queda «no disponible» un rato: **nunca**
  abre otra base sin cifrar a escondidas.
- Si el archivo cifrado no se puede leer con la llave (restaurado en otro teléfono, dañado) se descarta y se vuelve a descargar todo del
  servidor. Lo único que se perdería son cambios que no se hubieran alcanzado a enviar.
- Ajustes → Modo sin conexión → Diagnóstico → **Cifrado: Activo** permite comprobarlo en el teléfono.

## Qué exige (NO viaja por OTA)

1. `app.json`: plugin `["expo-sqlite", { "useSQLCipher": true }]` y **bump de `version`** (cambio nativo: SQLCipher y `expo-crypto`
   van dentro del binario). El runtime nuevo corta las OTA hacia los binarios anteriores, por eso `LEGACY_RUNTIMES` en
   `scripts/publish-ota.mjs` debe incluir el runtime que dejan de ser «el actual» (1.1.0), o el iPhone se queda sin actualizaciones en silencio.
2. **Android**: `npm run build:android` (EAS) → instalar el APK nuevo.
3. **iPhone**: workflow de GitHub «Compilar IPA de iPhone (sin firmar)» → Sideloadly (ver `docs/BUILD_IPA_GITHUB.md`). El Apple ID gratuito
   sigue caducando a los 7 días.

## Límites conocidos (lo que el cifrado NO cubre todavía)

- **La caché de React Query en AsyncStorage** (primera página de movimientos, resumen del espacio, notificaciones) sigue sin cifrar.
  Es el siguiente paso si se quiere cerrar el tema por completo.
- Los datos que ya están en pantalla o en memoria, y los comprobantes que se descargan, no pasan por esta base.
- El cifrado no protege con el teléfono desbloqueado y la app abierta.

## Pruebas

- Automáticas: `lib/offline/__tests__/db-encryption.test.ts` (copia completa con cola y autoincremento, copia interrumpida, formato de la llave).
- **Solo en el teléfono** (nada automático lo demuestra): instalar el binario nuevo SOBRE el anterior con cambios sin enviar y comprobar que (a)
  los cambios pendientes siguen ahí y se envían, (b) Diagnóstico dice «Cifrado: Activo», (c) tras cerrar sesión y volver a entrar la copia se
  vuelve a descargar.
