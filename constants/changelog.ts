export type ChangelogEntry = {
  version: string;
  title: string;
  changes: string[];
};

/**
 * Historial de cambios en lenguaje simple (para cualquier usuario, sin tecnicismos).
 * Más nuevo primero. Se muestra al tocar la versión en Configuración.
 */
export const CHANGELOG: ChangelogEntry[] = [
  {
    version: "1.0.10",
    title: "DarkMoney estrena look",
    changes: [
      "DarkMoney estrena look. El fondo pasa de azulado a un gris cálido, los montos se leen de un vistazo porque los céntimos ya no compiten con la cifra, y en la lista de movimientos caben cuatro filas más por pantalla sin que la letra se haga más chica.",
      "El inicio va directo al grano: se fueron los textos que describían la pantalla antes de mostrarla, así que ves tus cifras apenas abres.",
      "Cuando no hay nada previsto para la semana, la app te lo dice con palabras en vez de mostrarte ceros que parecían un error de carga.",
      "El gráfico de cierre de mes ahora se lee como un recorrido: cada barra arranca donde terminó la anterior, así ves qué te sube y qué te baja el saldo.",
      "En el historial del año, los meses en los que gastaste más de lo que entró bajan por debajo de la línea. Un mal mes se ve de un golpe.",
      "Elegir entre vista simple y avanzada se mudó a Configuración: se elige una vez y se recuerda, en vez de ocupar sitio en cada pantalla.",
      "Cómo te habla el asistente del inicio también se elige una vez en Configuración, en lugar de preguntártelo en cada pantalla.",
      "En la pestaña de Salud, en vez de un texto que te explica el problema, ahora hay un botón que te lleva directo a los movimientos sin categoría para arreglarlos.",
      "Tus contactos ahora entran más por pantalla, y ya no repiten la categoría dos veces en la misma línea.",
      "Los colores ahora significan una sola cosa cada uno: verde es plata que entra, y los gastos ya no se ven como si fueran un error. El asistente tiene su propio color, para que distingas lo que él opina de lo que dicen tus cuentas.",
      "Cada día de la lista de movimientos te dice de un vistazo cuánto entró o salió ese día.",
      "La pantalla que ves mientras la app abre ya no es azul: usa el mismo gris cálido que todo lo demás, así que abrir DarkMoney ya no da un salto de color.",
      "La barra de abajo ya no tapa lo último de cada lista, y con la letra del sistema en grande dejó de cortarse.",
      "Al bloquear y desbloquear el teléfono, la app ya no te muestra la pantalla de inicio de sesión: sigues donde estabas.",
      "Si guardas algo apenas abres la app y la conexión todavía va lenta, DarkMoney espera a que el servidor termine antes de darte por perdido: ya no te avisa que no sabe si se guardó cuando en realidad sí quedó registrado.",
      "El menú \"Más\" ahora cabe entero sin desplazarse, y cada opción te dice lo que tiene dentro: cuánto te cuestan al mes tus suscripciones, cuántas categorías tienes, a cómo está el dólar.",
      "Configuración dejó de empezar con un formulario largo. Tus datos y tu foto tienen ahora su propia pantalla, y las preferencias se ven todas juntas apenas entras.",
      "Elegir tu moneda base ya no es buscar entre veintidós botoncitos: es una línea que dice cuál tienes y abre la lista al tocarla.",
      "En Detección automática ya no hay que elegir cuenta app por app: viene puesta tu cuenta principal y se cambia solo si quieres otra.",
      "Las opciones del menú \"Más\" ahora vienen agrupadas: lo que reclama tu atención, lo que se repite cada mes y lo que se configura una vez.",
      "Cuando un filtro esconde todo lo que tienes, la app ya no te dice \"sin resultados\" como si no hubiera nada: te dice cuántos tienes y te ofrece quitar el filtro.",
      "En Suscripciones, el total del mes ahora aclara que las pausadas no están sumadas, así que la cuenta ya no parece mal hecha.",
      "Arreglado un error de cuentas: una deuda que alguien compartió contigo se sumaba a lo que te deben en vez de a lo que debes. Por eso podías ver \"No debes nada\" teniendo una deuda justo debajo. Afectaba también a las cifras del inicio.",
      "Registrar una deuda o un préstamo cabe ahora en una pantalla. Antes eran dieciocho campos repartidos en tres pantallas de scroll para cuatro que son obligatorios; los demás viven en \"Más detalles\", que se abre solo si lo necesitas. Y dice \"Me deben\" y \"Yo debo\", que es como lo piensa uno.",
      "En el detalle de una deuda o préstamo ahora ves el plan al lado de lo que de verdad se pagó: si acordaron 300 y te pagaron 320, se ven los dos números juntos. Los 20 de más no cambian las cuotas que pactaron, se descuentan de la última.",
      "Al crear una deuda o préstamo, la app te ofrece invitar a la otra persona cuando ya está guardada — y no manda nada hasta que toques Enviar. Antes el correo salía solo al guardar, sin que pudieras revisarlo.",
      "Nuevo: puedes acordar los pagos uno por uno. Si tu acuerdo es \"100 en setiembre, 150 en octubre y 200 de ahí en adelante\", lo escribes tal cual y la app calcula el resto hasta terminar el saldo — incluida la última cuota, que casi nunca es igual a las otras. Antes solo se podían poner cuotas iguales.",
      "Crear una suscripción ya no es una pantalla larguísima: pide el nombre, el monto, cada cuánto se cobra y cuándo es el próximo, y todo lo demás está en \"Opcionales\" por si lo necesitas.",
      "Ya no te pide tres fechas para una suscripción. Solo la del próximo cobro, que es la única que el sistema usa; el inicio y el fin quedaron como opcionales.",
      "Crear una cuenta ya no empieza por dos filas de botones que se cortan por el borde: tipo, institución, moneda y apariencia son cuatro líneas que abren su lista, y el botón te dice qué falta mientras no le pongas nombre.",
      "Crear una categoría empieza por el nombre. Los íconos y colores pasaron a una línea que abres si quieres cambiarlos, en vez de ocupar media pantalla antes del único campo obligatorio.",
      "Desapareció el campo \"Orden\" de las categorías, que pedía un número sin explicar para qué servía. Ahora se acomoda solo.",
      "Elegir moneda, cuenta, categoría o contacto en cualquier formulario ya no es una fila de botones que se corta por el borde: es una lista que se abre y se puede buscar.",
      "Los botones de guardar ahora te dicen qué falta —\"Falta el monto\"— en vez de quedarse apagados sin explicar por qué.",
      "La pestaña Salud dejó de ser interminable. Antes te daba cuatro porcentajes distintos de \"confianza\" sin decirte cuál mirar; ahora hay uno solo, con lo que falta para subirlo.",
      "En Salud, lo primero que ves por revisar son los movimientos sin contraparte: eran los más numerosos y estaban escondidos. Y los que no tienen categoría te dicen cuánto pesan de tu gasto.",
      "La proyección del cierre de mes ya no está repetida en dos pestañas: vive solo en Flujo, que es donde la buscas.",
      "Lo de \"cómo aprende DarkMoney\" se mudó a Configuración › Acerca de. Estaba en medio de tus finanzas ocupando media pantalla, y no era algo que pudieras cambiar.",
      "Registrar un movimiento es mucho más rápido: pones el monto y la cuenta y ya puedes guardar. Antes te obligaba a pasar por una pantalla entera de campos que no eran obligatorios.",
      "Los detalles —categoría, contraparte, notas, comprobantes— siguen ahí, pero ahora entras solo si los necesitas.",
      "El botón de guardar ya no se esconde al final: está fijo abajo desde que abres el formulario.",
      "El monto se escribe como en el resto de la app: S/ 21.30, no \"PEN 21.3\".",
      "En una transferencia entre tus cuentas ya no se pinta una mitad en rojo como si hubieras perdido plata: es la misma plata cambiando de bolsillo, y la app ahora te lo dice.",
      "Las sugerencias de la app ya no anuncian que están pensando ni te dicen que no encontraron nada: aparecen solo cuando hay algo que proponer, pegadas al campo que van a cambiar, y te dan la razón en palabras —\"Porque corregiste esto antes\"— en vez de un porcentaje que no sabías con qué comparar.",
      "En los detalles del movimiento, elegir categoría o contraparte ya no es una fila de botones que se corta por el borde: es una lista que se abre y se puede buscar.",
      "La fecha y la hora ahora se ven de un vistazo —\"Hoy, 14:50\"— y se abren solo si quieres cambiarlas.",
    ],
  },
  {
    version: "1.0.9",
    title: "Detecta tus pagos desde el correo",
    changes: [
      "Ya puedes detectar tus pagos automáticamente desde el correo: en Configuración generas una dirección privada, reenvías ahí los correos que te manda tu banco y DarkMoney te sugiere el movimiento listo para confirmar. Es la forma de detectar pagos en iPhone.",
      "La app abre bastante más rápido y puedes registrar un movimiento de inmediato, sin esperar a que terminen de cargar tus créditos, deudas y presupuestos.",
      "Si tocas \"Guardar\" dos veces por nervios, ya no se registra dos veces.",
      "Cuando la conexión falla —se pone lenta, cambias de WiFi a datos móviles o se corta a mitad de un guardado— la app se recupera sola y no pierdes lo que habías escrito.",
    ],
  },
  {
    version: "1.0.8",
    title: "El asistente te habla",
    changes: [
      "El asistente puede responderte en voz alta: activa el \"modo hablante\", háblale y te contesta hablando. Ideal para consultar tu plata sin mirar la pantalla. (Pro)",
    ],
  },
  {
    version: "1.0.7",
    title: "Tus notificaciones intactas y un asistente más listo",
    changes: [
      "DarkMoney ya nunca borra las notificaciones de otras apps (banco, Yape, correo): solo muestra su aviso al lado.",
      "Los movimientos detectados que quedaban \"guardándose\" ahora se guardan solos al abrir la app.",
      "El asistente compara meses (\"¿gasté más que el mes pasado?\"), calcula ganancias de reventa y puede crear presupuestos, deudas y suscripciones por chat, siempre pidiéndote confirmar antes. (Pro)",
    ],
  },
  {
    version: "1.0.6",
    title: "Habla para registrar",
    changes: [
      "Puedes dictar por voz tus movimientos al asistente en vez de escribir. (Pro)",
      "Mejoras en los recordatorios de presupuestos.",
    ],
  },
  {
    version: "1.0.5",
    title: "Reportes para compartir",
    changes: [
      "Nuevo reporte en PDF de créditos y deudas: un documento claro que puedes mandar por WhatsApp para mostrar cuánto se debe y cuánto se ha pagado.",
    ],
  },
];

export const CHANGELOG_OLDER =
  "Versiones anteriores: mejoras de rendimiento, avisos inteligentes y estabilidad general.";
