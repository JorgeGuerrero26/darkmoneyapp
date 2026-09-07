/**
 * Lo que dice la hoja de confirmar una llegada.
 *
 * La hoja preguntaba cuatro cosas —fecha, monto, cuenta, cambio de base— y en el caso frecuente
 * la respuesta a todas era "lo que ya dice": venían precargadas. Confirmar una llegada normal
 * obligaba a leer cuatro campos para no tocar ninguno. Ahora **afirma lo que va a hacer**, y lo
 * excepcional entra por una fila. Estas frases son esa afirmación, así que se prueban.
 */

type ConfirmSentenceArgs = {
  accountName: string | null;
  /** Ya formateada: "29 jul". */
  dateLabel: string;
};

/**
 * "Se anota como ingreso en Cuenta Sueldo, con fecha 29 jul."
 *
 * Sustituye a un campo que no se podía llenar: "Cuenta destino del movimiento" era un rótulo con
 * su caja y dentro un texto gris que decía dónde se iba a registrar — una afirmación disfrazada
 * de campo, y el gris la hacía parecer un marcador de posición vacío.
 */
export function arrivalConfirmSentence({ accountName, dateLabel }: ConfirmSentenceArgs): string {
  const account = accountName?.trim();
  return account
    ? `Se anota como ingreso en ${account}, con fecha ${dateLabel}.`
    : `Se anota como ingreso con fecha ${dateLabel}. Falta elegir la cuenta.`;
}

/**
 * "S/ 149.50 más que lo esperado." — vacío cuando llegó lo pactado.
 *
 * Solo tiene sentido dentro de "Llegó distinto": es el único sitio donde de verdad hay dos
 * números que comparar. En la hoja normal el esperado se dice una vez y no compite consigo mismo.
 */
export function arrivalDiffSentence(
  actual: number,
  expected: number,
  formatAmount: (value: number) => string,
): string {
  const delta = Math.round((actual - expected) * 100) / 100;
  if (delta === 0) return "";
  return `${formatAmount(Math.abs(delta))} ${delta > 0 ? "más" : "menos"} que lo esperado.`;
}

/**
 * El botón dice lo que va a pasar, no el efecto interno.
 *
 * Decía "Confirmar y crear movimiento" en dos líneas: no cabía porque compartía fila con
 * "Cancelar", y nombraba una consecuencia de base de datos. Nadie viene a crear un movimiento;
 * viene a decir que le pagaron. Cuando el monto cambió sí vale repetir la cifra, que es lo que
 * se está guardando y lo que conviene revisar antes de tocar.
 */
export function arrivalConfirmLabel(
  actual: number | null,
  expected: number,
  formatAmount: (value: number) => string,
): string {
  if (actual == null || Math.round((actual - expected) * 100) === 0) return "Confirmar llegada";
  return `Confirmar ${formatAmount(actual)}`;
}
