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

**Estado 2026-10-13: 3.4–3.6 integradas en la rama `offline-fase3-4` y verdes en automático; prueba en
dispositivo PENDIENTE.** Cuentas, categorías, contactos, tipos de gasto, plantillas, presupuestos y las
definiciones de suscripciones e ingresos recurrentes se escriben por la base local (con el interruptor
encendido); metas y roles de contacto no tienen pantalla en la app. Pagos de suscripciones y llegadas de
ingresos siguen en línea. Antes de probar, el servidor necesita la migración `202610130001` (no aplicada:
la aplica el dueño). Las pruebas PGlite/Jest no verifican `expo-sqlite` en iPhone ni gestos/red real.

### Guía corta de la Fase 3 (con modo avión)

A. **Catálogo nuevo y de inmediato usado:** en modo avión crea una categoría desde *Categorías* y una cuenta
   desde *Cuentas*; sin cerrar nada, registra un movimiento con ambas. Esperado: la categoría y la cuenta
   aparecen al instante en el formulario y en su lista, el saldo de la cuenta nueva cambia, y arriba de cada
   lista aparece el aviso "Sin conexión · N cambios guardados".
B. **Persistencia:** mata la app del todo, ábrela sin internet: todo sigue ahí. Quita el modo avión: el aviso
   pasa a "Todo al día"; en la web aparecen una sola vez (sin duplicados).
C. **Borrado con comprobación:** borrar una categoría con movimientos debe decir, sin red, "No se puede
   eliminar: hay movimientos que usan esta categoría" (igual que en línea). Una sin uso se borra al instante.
D. **Presupuesto:** crea un presupuesto sin red, registra un gasto de su categoría y comprueba que el avance
   sube al instante. Al sincronizar, el avance debe seguir igual (si cambia, anotar los dos valores).
E. **Suscripción / ingreso recurrente:** crear y editar la definición sin red funciona; marcar como pagada o
   confirmar la llegada sin red muestra el aviso de que necesita internet (sin cambios a medias).
F. **Interruptor apagado:** repetir A–E con el modo apagado: debe comportarse exactamente como antes.

### Guía corta de la Fase 4 (obligaciones y varios espacios)

G. **Obligación sin red:** en modo avión crea una deuda o préstamo **sin** movimiento de apertura y con contacto.
   Aparece al instante en *Obligaciones* con pendiente = monto; edita la fecha y archívala. Al volver la red:
   "Todo al día" y en la web una sola vez, con los cambios.
H. **Con movimiento de apertura:** en modo avión intenta crear una obligación que registra el dinero entregado o
   recibido. Debe avisar que necesita internet y **no guardar nada** (ni obligación ni movimiento).
I. **Contacto con deudas:** borrar un contacto que tiene una obligación debe decir, sin red, que no se puede y
   sugerir archivarlo.
J. **Pagos y eventos:** registrar un pago, interés o ajuste sigue exigiendo internet (no se probó atomicidad).
K. **Varios espacios:** con dos espacios (personal y compartido), registra un movimiento sin red en el primero,
   cambia al segundo y vuelve la red: el movimiento del primero debe llegar sin volver a abrir el primero.
   Al cambiar de espacio, sus datos deben estar listos al instante (sin "Preparando tus datos").
L. **Borrar una obligación** y todo lo de compartir (invitar, solicitudes de pago, vista de invitado) sigue
   siendo en línea; sin red muestran el último dato guardado.

### Casos extendidos
