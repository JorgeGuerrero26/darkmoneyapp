# Cómo redactar el changelog

El changelog vive en `constants/changelog.ts` y se muestra al tocar la versión en
**Configuración → Versión X · Ver novedades**.

## La regla que manda

**Lo lee alguien que nunca ha tocado un sistema.** No es un registro técnico: es lo que gana el
usuario. Si una frase solo la entiende quien conoce el código, está mal escrita.

Antes de dar por buena una línea, hazte una pregunta: *¿esto le dice a mi tía qué puede hacer
ahora que antes no podía?* Si la respuesta es no, reescríbela.

## Prohibido

Nada de esto entra en el changelog, por más cierto que sea:

- Nombres de archivos, funciones, tablas, columnas o endpoints.
- Palabras del oficio: *query*, *cache*, *hook*, *timeout*, *race condition*, *refactor*,
  *deploy*, *migración*, *índice*, *RLS*, *edge function*, *bundle*, *OTA*.
- Números de versión de librerías, códigos de error, nombres de servicios externos.
- Trabajo interno sin efecto visible. Un refactor que nadie nota **no se anuncia**: el changelog
  no es para lucir esfuerzo.
- Disculpas o autocrítica ("sentimos el error", "por fin arreglamos"). Se cuenta qué mejoró.

## Formato

```ts
{
  version: "1.0.8",              // el mismo string que app.json
  title: "El asistente te habla", // 3-6 palabras, lo más valioso de la versión
  changes: [
    "Frase completa que empieza con lo que el usuario gana. (Pro)",
  ],
}
```

- **Más nuevo primero** en el array.
- **`title`**: corto y concreto. Nombra el beneficio, no el área técnica. "El asistente te habla"
  sí; "Mejoras en el asistente" no.
- **`changes`**: una entrada por mejora perceptible. Frases completas, con punto final.
- **`(Pro)`** al final de la línea si la función es solo del plan Pro.
- 1 a 4 puntos por versión. Si tienes ocho, casi todos son ruido interno.

## Traducir de técnico a humano

| Lo que pasó en el código | Cómo se escribe |
|---|---|
| Guard `submittingRef` en 11 formularios | "Si tocas *Guardar* dos veces por nervios, ya no se registra dos veces." |
| `client_dedupe_key` + índice único parcial | (no se anuncia: el usuario ya lo vio como el punto de arriba) |
| Cancelación de notificaciones ajenas neutralizada | "DarkMoney ya nunca borra las notificaciones de otras apps (banco, Yape, correo): solo muestra su aviso al lado." |
| `recoverSession()` al volver a foreground | "Los movimientos detectados que quedaban \\"guardándose\\" ahora se guardan solos al abrir la app." |
| Builder de PDF con `expo-print` | "Nuevo reporte en PDF de créditos y deudas: un documento claro que puedes mandar por WhatsApp." |

El patrón: **describe el síntoma que el usuario sufría, o la acción que ahora puede hacer.**
Nunca el mecanismo.

## Qué versión usar

Esto se equivoca fácil y tiene consecuencias:

- **Cambio solo de JS/assets (se envía por OTA):** NO se toca `version` en `app.json`. La política
  `runtimeVersion: appVersion` corta la compatibilidad de los updates si se bumpea. Los cambios
  se **suman a la entrada de la versión actual**, ajustando el `title` si hace falta.
- **Cambio nativo (Kotlin, permisos, dependencias nativas):** sí se bumpea `version` y
  `versionCode` en `app.json`, y se crea una entrada nueva.

Ver la sección *OTA updates* de `CLAUDE.md`.

### Pendiente: 1.0.9 en el próximo binario

Decidido el 2026-07-28. La entrada de 1.0.8 acumula varias mejoras enviadas por OTA, y el
número se quedó quieto a propósito: bumpearlo sin construir binarios dejaría sin updates al
iPhone, al Android y al APK del compañero, los tres con runtime `1.0.8`.

**En el próximo build nativo hay que hacer las tres cosas juntas:**

1. `version: "1.0.9"` y `versionCode: 10` en `app.json`.
2. Entrada nueva `1.0.9` en `constants/changelog.ts`, moviendo a ella lo que se anunció como
   1.0.8 pero salió después del binario 1.0.8 (detección de pagos por correo, el arreglo del
   doble toque en *Guardar*, el aviso de conexión lenta).
3. Los builds: `npm run build:android` y, para iOS, `docs/REINSTALL_IOS.md`.

Si se bumpea la versión sin el paso 3, los dispositivos quedan congelados.

## Antes de cerrar

- [ ] Ninguna línea contiene una palabra de la lista de prohibido.
- [ ] Cada línea dice qué gana el usuario, no qué se tocó.
- [ ] La versión coincide con `app.json`, y solo se bumpeó si hubo cambio nativo.
- [ ] Las comillas dobles internas van escapadas (`\\"`) — el archivo es TypeScript.
- [ ] `npm run typecheck` pasa.
