# Prueba en el teléfono del modo sin conexión (beta)

Las pruebas automáticas (Jest, SQLite en memoria, PostgreSQL local) **no verifican el teléfono**:
ni `expo-sqlite` real, ni la red real, ni el comportamiento de iOS al ir a segundo plano. La
lección del 2026-09-26 (gestos que pasaban en Jest y fallaban en el iPhone) aplica igual aquí.
Esta guía es la prueba que falta. **Estado: pendiente de ejecutar en iPhone y Android.**

Requiere el IPA/APK **1.1.0** (docs/BUILD_IPA_GITHUB.md para el IPA).

## 0. Preparación

1. Instala el binario 1.1.0 y abre la app. Inicia sesión.
2. *Ajustes → Modo sin conexión (beta)* → activa **Usar el modo sin conexión**.
3. Espera a que **Ahora** diga *Todo al día* (la primera vez descarga tus datos; con ~1.100
   movimientos son pocos segundos). Mientras diga *Preparando tus datos…* la app sigue usando
   internet como siempre.
4. Si dice *No disponible en esta versión de la app*, el binario no trae `expo-sqlite`: no es el 1.1.0.

## 1. Lo que importa: registrar varios movimientos sin internet

1. Activa **modo avión** (Wi-Fi y datos apagados).
2. En *Movimientos*, registra **10 movimientos seguidos**. Anota si cada guardado es instantáneo.
   - ✅ Cada uno se guarda al momento, sin espera ni error.
   - ✅ Arriba de la lista aparece **Sin conexión · N cambios guardados…**.
   - ✅ El saldo de la cuenta baja/sube de inmediato (Cuentas e inicio).
3. Edita uno (monto y descripción), anula otro y borra otro. Deben verse al instante.
4. **Cierra la app del todo** (desliza hacia arriba para matarla) y vuelve a abrirla **todavía sin
   internet**. ✅ Los 10 movimientos y los cambios siguen ahí; el aviso sigue diciendo cuántos faltan.
5. Quita el modo avión. ✅ En segundos el aviso pasa a *Enviando…* y desaparece (*Todo al día*).
6. Comprueba en otro dispositivo, o en la web, que los movimientos llegaron **una sola vez** (sin
   duplicados) y con los montos correctos.

## 2. Segundo plano y primer plano

1. Con internet, registra un movimiento y manda la app a segundo plano **al instante**.
2. Vuelve a abrirla: ✅ debe quedar enviado (iOS puede cortar el envío al irse a segundo plano; al
   volver se completa solo — eso es lo esperado y lo que se promete).
3. Pon el teléfono 5 min sin tocarlo y ábrelo: ✅ sigue *Todo al día*.

## 3. Botón manual

*Ajustes → Modo sin conexión → Sincronizar ahora*, primero sin internet (✅ muestra el motivo en
*Último aviso* y no pierde nada) y luego con internet (✅ limpia lo pendiente).

## 4. Dos personas (si hay un espacio compartido)

1. Persona A y B ven el mismo movimiento. A queda sin conexión y B cambia el **monto**.
2. A cambia **ese mismo monto** sin conexión y vuelve la red.
3. ✅ El cambio de A se guarda y aparece **1 cambio para revisar** (*Para revisar* dice cuál era el
   monto de antes). Si A solo cambia la **descripción**, no debe avisar nada.

## 5. Regresión del swipe en iOS (regla de CLAUDE.md)

La lista de Movimientos ahora sale de SQLite (con el modo encendido). Repite la prueba de
`CLAUDE.md` (*Deslizamiento en iOS al cambiar de módulo*): filas 1, 2 y 4 antes y después de
alternar **Movimientos → Cuentas → Movimientos** varios ciclos, con y sin scroll previo. La fila
tocada y la desplazada deben coincidir. **Resultado: pendiente.**

## 6. Cerrar sesión

- Sin cambios pendientes: cerrar sesión borra la base local del usuario.
- Con cambios pendientes y sin internet: cerrar sesión **no** los borra (se conservan para el
  próximo inicio de sesión del mismo usuario).

## 7. Apagarlo

*Ajustes → Modo sin conexión* → apagar el interruptor: la app vuelve a funcionar exactamente
como antes (consulta internet para todo). Los cambios que quedaran sin enviar siguen en el
teléfono y se enviarán al volver a encenderlo.

## Qué reportar si algo falla

- Captura de la pantalla *Modo sin conexión* (estado + diagnóstico) justo después del fallo.
- El paso exacto y la hora aproximada.
- Si hubo un aviso en *Para revisar*, su texto.
- Si la app se cerró sola: ¿en qué pantalla?

## 8. Casos de Fase 3 y Fase 4 — pendientes de dispositivo e integración

**Estado 2026-10-13: pendientes.** P1/P2 resueltas; etapas 3.1–3.3 verificadas en automático.
La migración no está aplicada y los CRUD/lecturas de módulos no están integrados (3.4–3.5).
No intentar esos CRUD como si ya estuvieran disponibles en la app. Las pruebas PGlite/Jest
no verifican `expo-sqlite` en iPhone ni sus gestos/red real.

Tras integrar y desplegar las etapas correspondientes, probar:

1. Crear sin red una cuenta, categoría y contraparte; registrar un movimiento con esos IDs;
   cerrar y abrir la app sin red; comprobar que nombres, referencias y centavos se conservan.
2. Borrar una cuenta/categoría con movimientos: verificar `SET NULL` y saldos después del envío.
   Borrar una contraparte con obligaciones: comprobar el rechazo por `RESTRICT` y el aviso.
3. Crear/editar presupuesto, suscripción, ingreso fijo, plantilla y meta sin red; comprobar
   persistencia, envío único y separación de la meta por usuario y workspace.
4. Fase 3: pagar una suscripción o confirmar una llegada sin red muestra el aviso de internet
   **sin movimiento, ocurrencia ni avance de fecha**. También editar/anular/borrar pagos
   vinculados; comprobar cero operaciones nuevas y que el formulario conserva los cambios.
   Repetir con beta apagada y con red para verificar el camino anterior.
5. Interrumpir la red después de que el servidor confirme el envío y antes de recibir respuesta;
   reintentar y comprobar que no se dupliquen dinero, ocurrencias ni avances de fecha.
6. Una ocurrencia de ingreso con cuatro decimales conserva el monto exacto y solo se lee.
   Una definición con fracción de centavo, incluso en descuentos, no puede editarse/borrarse
   offline. Los historiales de suscripciones no ofrecen escrituras ni consumen IDs.
7. Dos usuarios editando/pagando en un workspace compartido, pérdida de permiso y borrados:
   saldo final, revisión de conflictos y aislamiento entre workspaces/usuarios.
8. Viewers de obligaciones: solo lectura, antigüedad del caché y ausencia total de operaciones
   en el outbox. Cambiar de usuario no debe mostrar el caché del anterior.
9. Con la beta apagada, repetir creación/edición/borrado y pagos online: mismas firmas,
   textos y comportamiento. Repetir también la prueba de swipe de la sección 5.
10. Actualizar una instalación con SQLite v1 y datos pendientes a v2; abrir/cerrar sin red,
    comprobar cuentas, IDs y outbox intactos. Alternar usuarios y workspaces sin datos ajenos.
11. Comparar progreso del presupuesto antes y después del envío con moneda propia/convertida,
    categoría/tipo de gasto, límite superado y fechas en el borde del período. Comprobar respaldo
    del servidor si falta una tasa completa, paridad o quedan efectos de triggers pendientes.
12. Revisar suscripciones activas, pausadas, canceladas, meses saltados y ancla 31. Editar la
    definición offline no debe generar historial ni anunciar una fecha definitiva antes del pull.
    Borrar una suscripción con pagos requiere el camino online existente.

**Resultado en iPhone/Android: pendiente.** No se publicó OTA/EAS ni se hizo prueba nativa.
