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
    version: "1.0.9",
    title: "Detecta tus pagos desde el correo",
    changes: [
      "Ya puedes detectar tus pagos automáticamente desde el correo: en Configuración generas una dirección privada, reenvías ahí los correos que te manda tu banco y DarkMoney te sugiere el movimiento listo para confirmar. Es la forma de detectar pagos en iPhone.",
      "La app abre bastante más rápido y puedes registrar un movimiento de inmediato, sin esperar a que terminen de cargar tus créditos, deudas y presupuestos.",
      "Si tocas \"Guardar\" dos veces por nervios, ya no se registra dos veces.",
      "Al bloquear y desbloquear el teléfono, la app ya no te muestra la pantalla de inicio de sesión: sigues donde estabas.",
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
