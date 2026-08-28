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

### Hecho: 1.0.9 (2026-08-02)

Ejecutado el plan que se decidió el 2026-07-28. La entrada de 1.0.8 había acumulado mejoras
enviadas por OTA con el número quieto a propósito; al construir el binario 1.0.9 se movieron
a su entrada (detección de pagos por correo, doble toque en *Guardar*, arranque más rápido,
aviso de conexión lenta) y 1.0.8 se quedó solo con el asistente hablante, que sí venía dentro
de aquel binario.

**Deuda que dejó el bump:** el iPhone corre un `.ipa` con runtime `1.0.8` y no hay Mac para
recompilarlo, así que **dejó de recibir OTAs**. Se quedó con todo lo publicado hasta el
2026-07-31, que era el estado completo de `main`. Para volver a alimentarlo hay que rehacer el
`.ipa` (ver `docs/REINSTALL_IOS.md`) o publicar a mano contra el runtime viejo revirtiendo
`version` temporalmente — feo, evitarlo.

Regla que sigue vigente: **bumpear `version` sin construir los binarios de las dos
plataformas congela a la que se quedó atrás.**

### Hecho: 1.0.10 (2026-08-27)

Mismo movimiento que en 1.0.9, y por el mismo motivo. El binario 1.0.9 salió al principio del
día; encima de él se publicaron por OTA el rediseño visual entero y dos arreglos de fiabilidad,
que se habían ido acumulando en la entrada de 1.0.9 con el número quieto. Al construir el
binario 1.0.10 (splash en grafito) esas líneas se movieron a su entrada, y 1.0.9 se quedó solo
con lo que venía dentro de aquel APK: detección por correo, arranque más rápido, doble toque en
*Guardar* y recuperación de conexión.

El título de 1.0.10 lo lidera el rediseño porque es lo único que el usuario nota al abrir. El
color del arranque —que es lo que obligó al binario— queda como una línea más dentro de él: es
parte del mismo cambio de aspecto, no un tema aparte.

**Regla que se confirma:** cuando se construye un binario, lo publicado por OTA desde el
binario anterior se mueve a la entrada nueva. La entrada vieja se queda solo con lo que iba
dentro de aquel binario. Si no, la versión que la gente tiene en pantalla muestra una nota
menor mientras el cambio grande queda enterrado en una versión anterior.

## Antes de cerrar

- [ ] Ninguna línea contiene una palabra de la lista de prohibido.
- [ ] Cada línea dice qué gana el usuario, no qué se tocó.
- [ ] La versión coincide con `app.json`, y solo se bumpeó si hubo cambio nativo.
- [ ] Las comillas dobles internas van escapadas (`\\"`) — el archivo es TypeScript.
- [ ] `npm run typecheck` pasa.
