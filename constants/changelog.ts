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
    version: "1.0.8",
    title: "El asistente te habla y tus pagos llegan por correo",
    changes: [
      "El asistente puede responderte en voz alta: activa el \"modo hablante\", háblale y te contesta hablando. Ideal para consultar tu plata sin mirar la pantalla. (Pro)",
      "En iPhone ya puedes detectar tus pagos automáticamente: en Configuración generas una dirección privada, reenvías ahí los correos que te manda tu banco y DarkMoney te sugiere el movimiento listo para confirmar.",
      "Si tocas \"Guardar\" dos veces por nervios, ya no se registra dos veces.",
      "El aviso de \"conexión lenta\" ya no aparece cuando tu internet va bien.",
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
