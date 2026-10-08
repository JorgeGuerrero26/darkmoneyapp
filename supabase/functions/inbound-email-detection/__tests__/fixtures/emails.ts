import type { ReceiptEmail } from "../../logic";

export const BCP_YAPEO: ReceiptEmail = {
  from: "BCP Notificaciones <notificaciones@notificacionesbcp.com.pe>",
  subject: "Constancia de Yapeo a Celular - Servicio de Notificaciones BCP",
  text: [
    "Realizaste un yapeo a celular de S/ 92.10 desde tu Cuenta de ahorro Soles.",
    "Operación realizada\tYapear a celular",
    "Fecha y hora\t27 de septiembre de 2026 - 01:52 PM",
    "Enviado a\tBeneficiario Ficticio\n*** **1 000",
    "Destino\tYape",
    "Número de operación\t100005",
  ].join("\n"),
};

export const YAPE_COMERCIO: ReceiptEmail = {
  from: "YAPE Notificaciones <notificaciones@yape.pe>",
  subject: "Confirmación de pago",
  text: "",
  html: '<p>Hola NOMBRE,<br>¡Tu pago en CINEPLANET&#xA;fue exitoso!</p><p>Monto total<br><b>S/</b>&#x32;6.50</p><table><tr><td>Fecha y hora:</td><td>05 septiembre 2026 - 04:18 p.&nbsp;m.</td></tr><tr><td>ID de operación:</td><td>Compras Cineplanet</td></tr></table>',
};

/**
 * Correos reales anonimizados. Ver README.md: la estructura es lo único que el parser lee, así
 * que se conserva tal cual y solo se sustituyen los datos personales.
 */

export const BCP_CONSUMO: ReceiptEmail = {
  from: "notificaciones@notificacionesbcp.com.pe",
  subject: "Constancia de consumo",
  text: [
    "Hola Nombre Ficticio,",
    "Realizaste un consumo de S/ 52.50 con tu Tarjeta de Débito BCP en CINEPLANET.",
    "Empresa\tCINEPLANET",
    "Número de operación\t100001",
  ].join("\n"),
};

export const BCP_TRANSFERENCIA: ReceiptEmail = {
  from: "notificaciones@notificacionesbcp.com.pe",
  subject: "Constancia de transferencia",
  text: [
    "Hola Nombre Ficticio,",
    "Realizaste una transferencia de S/ 110.00 desde tu Clasica.",
    "Operación realizada\tTransferencia entre mis cuentas",
    "Número de operación\t100002",
  ].join("\n"),
};

/**
 * El aviso legal del final NO se recorta: es justo lo que el extractor debe ignorar, y su
 * posición (carácter ~418 en el correo original) es la que dejaba solo 18 de margen frente a
 * la ventana de 400.
 */
export const YAPE_ENVIADO: ReceiptEmail = {
  from: "notificaciones@yape.pe",
  subject: "Por tu seguridad, te notificaremos por cada yapeo que realices",
  text: [
    "¡Hola, Nombre F*!",
    "",
    "¡Acabas de yapear exitosamente!",
    "",
    "Monto de yapeo*",
    "",
    "S/\t180.00",
    "Yapero\tNombre F*",
    "Tu número de celular\tXXXXXXXXX000",
    "Fecha y Hora de la operación\t27 julio 2026 - 08:29 p. m.",
    "Celular del Beneficiario\tXXXXXXXXX111",
    "Nombre del Beneficiario\tBeneficiario F*",
    "Nº de operación\t100003",
    "*Por tu seguridad, te notificaremos por cada",
    "yapeo que realices.",
    "",
    "Banner promocional",
    "Yape contáctanos",
    "Juntos somos más seguros",
    "En nuestras comunicaciones nunca incluiremos links a otras páginas, archivos adjuntos,",
    "ni solicitaremos tus datos personales o información de tus cuentas.",
    "Para cualquier consulta, no respondas a este correo.",
    "Si no deseas recibir la confirmación de tus yapeos por correo, presiona el siguiente enlace:",
  ].join("\n"),
};
