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
   - ✅ Bajo el título de la pantalla, donde decía "Actualizado hace…", aparece en dorado **Sin conexión · N por enviar ›** (tras 2–3 s si aún no hay nada guardado).
   - ✅ Cada movimiento sin enviar muestra un reloj dorado y **Por enviar · hora**.
   - ✅ El saldo de la cuenta baja/sube de inmediato (Cuentas e inicio).
3. Edita uno (monto y descripción), anula otro y borra otro. Deben verse al instante.
4. **Cierra la app del todo** (desliza hacia arriba para matarla) y vuelve a abrirla **todavía sin
   internet**. ✅ Los 10 movimientos y los cambios siguen ahí; la línea dorada sigue diciendo cuántos faltan.
5. Quita el modo avión. ✅ La línea pasa a gris **Enviando 2 de 3…**, aparece el aviso **3 cambios enviados** y vuelve **Actualizado hace…**.
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
ingresos siguen en línea. Las migraciones de servidor `202610130001` y `202610140001` ya están aplicadas en producción
(2026-10-14); el cliente con este código todavía no se publicó (OTA/IPA). Las pruebas PGlite/Jest no verifican `expo-sqlite` en iPhone ni gestos/red real.

### Guía corta de la Fase 3 (con modo avión)

A. **Catálogo nuevo y de inmediato usado:** en modo avión crea una categoría desde *Categorías* y una cuenta
   desde *Cuentas*; sin cerrar nada, registra un movimiento con ambas. Esperado: la categoría y la cuenta
   aparecen al instante en el formulario y en su lista, el saldo de la cuenta nueva cambia, y arriba de cada
   lista (y en el encabezado) aparece "Sin conexión · N por enviar".
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

### Guía corta del estado global (Revisión 54)

M. **Línea de estado:** en cualquier módulo (Movimientos, Cuentas, Presupuestos, Obligaciones…) la línea bajo el título es la misma.
   Sin conexión: dorada, "Sin conexión · N por enviar ›". Con todo al día: "Actualizado hace…" como siempre. No debe haber tarjeta
   ni píldora flotando en el contenido.
N. **Hoja de pendientes:** toca la línea dorada. Se abre "Pendientes de enviar" con TODOS los cambios de todos los módulos, el más
   reciente primero y con su hora ("Nuevo movimiento · Café", "Cuenta editada · nombre"), la nota de que los saldos ya los incluyen y
   el botón **Intentar enviar ahora**. Tocar un cambio abre su pantalla.
O. **Al volver internet:** gris "Enviando 2 de 3…", luego el aviso "3 cambios enviados" y de nuevo "Actualizado hace 1 s".
P. **Si algo falla:** la línea pasa a rojo "1 cambio necesita revisión ›" y no desaparece hasta resolverlo desde la hoja.
Q. **Corte breve:** quita y pon el internet en menos de 2 segundos: la línea no debe parpadear.
R. **Modo apagado:** ninguna de estas líneas ni avisos aparece, y los encabezados son los de siempre.

### Pagos sin conexión (Fase 5.1)

S. **Pagar una suscripción sin internet:** en modo avión, abre una suscripción y registra su pago. Debe guardarse al instante:
   el próximo cobro avanza y el saldo de la cuenta baja. La línea de estado dice "1 cambio guardado en tu teléfono" (un pago = un
   cambio, no dos). Al volver internet debe llegar **una sola vez** y el historial de la suscripción debe mostrar el pago.
T. **Pago repetido:** pagar dos veces el mismo cobro (tocar Guardar de nuevo) no debe duplicarlo.
U. **Pago rechazado:** si el servidor no puede aplicar el pago (por ejemplo la cuenta ya no existe), el próximo cobro **no** debe
   quedar avanzado, y debe llegar un solo aviso "necesita revisión".

V. **Llegada de un ingreso fijo sin internet:** en modo avión, abre un ingreso fijo y anota su llegada (cuenta de destino incluida). Debe
   guardarse al instante: el saldo de la cuenta sube, el ingreso pasa a esperar la siguiente fecha y la llegada aparece en su historial.
   La línea de estado dice "1 cambio guardado en tu teléfono" (la llegada = un cambio, no tres). Al volver internet debe llegar **una sola
   vez**, con el movimiento en Movimientos.
W. **Llegada repetida:** anotar dos veces la misma llegada (Guardar de nuevo) no debe duplicarla.
X. **Llegada rechazada:** si el servidor no la puede aplicar, no debe quedar nada a medias (ni movimiento, ni historial, ni fecha nueva)
   y debe llegar un solo aviso de revisión.

Y. **Pagar o cobrar una deuda sin internet:** en modo avión, abre una deuda y registra un pago/cobro con una cuenta. Debe guardarse al
   instante: el saldo de la cuenta cambia, el pendiente de la deuda baja y la línea de estado dice "1 cambio" (un pago = un cambio, no
   dos). Al volver internet debe llegar **una sola vez**: el movimiento en Movimientos y el pago en el historial de la deuda.
Z. **Sobrepago:** un pago mayor a lo pendiente se avisa antes de guardar, también sin internet.
AA. **Con comprobantes (fotos):** adjuntar una imagen al pago exige internet (la sube un servicio del servidor): sin red debe decirlo y no
   guardar nada.
AB. **Editar o borrar un pago sin internet:** sigue exigiendo internet y lo dice con claridad.
