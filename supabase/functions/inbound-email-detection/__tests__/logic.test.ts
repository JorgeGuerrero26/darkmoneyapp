import {
  buildDedupeKey,
  classifyMovement,
  extractAmount,
  extractOperationNumber,
  parseReceiptEmail,
  extractOperationDate,
  extractAliasToken,
} from "../logic";
import { BCP_CONSUMO, BCP_TRANSFERENCIA, BCP_YAPEO, YAPE_ENVIADO, YAPE_COMERCIO } from "./fixtures/emails";

describe("extractAmount", () => {
  it("lee soles con y sin separador de miles", () => {
    expect(extractAmount("Pagaste S/ 30.00 en RENIEC")).toEqual({ amount: 30, currencyCode: "PEN" });
    expect(extractAmount("Consumo por S/ 1,234.56")).toEqual({ amount: 1234.56, currencyCode: "PEN" });
    expect(extractAmount("Monto S/ 1 234.56")).toEqual({ amount: 1234.56, currencyCode: "PEN" });
  });

  it("lee dólares", () => {
    expect(extractAmount("Compra por US$ 12.50")).toEqual({ amount: 12.5, currencyCode: "USD" });
    expect(extractAmount("Cargo de USD 8")).toEqual({ amount: 8, currencyCode: "USD" });
  });

  it("lee el monto aunque el banco lo separe con tabulación", () => {
    // Yape maqueta el monto en su propia celda: "S/\t180.00".
    expect(extractAmount("Monto de yapeo*\n\nS/\t180.00")).toEqual({ amount: 180, currencyCode: "PEN" });
  });

  it("devuelve null si no hay monto", () => {
    expect(extractAmount("Tu estado de cuenta ya está disponible")).toBeNull();
  });
});

describe("classifyMovement", () => {
  it("detecta gastos por los verbos de la app", () => {
    expect(classifyMovement("Pagaste S/ 30 en RENIEC")).toEqual({ movementType: "expense", confidence: "high" });
    expect(classifyMovement("Yapeo exitoso")).toEqual({ movementType: "expense", confidence: "high" });
    expect(classifyMovement("Realizaste un consumo con tu tarjeta")).toEqual({ movementType: "expense", confidence: "high" });
  });

  it("detecta ingresos", () => {
    expect(classifyMovement("Recibiste S/ 50")).toEqual({ movementType: "income", confidence: "high" });
    expect(classifyMovement("Transferencia recibida")).toEqual({ movementType: "income", confidence: "high" });
  });

  it("trata la transferencia entre cuentas propias como transfer, no como gasto", () => {
    // Contarla como gasto bajaría el patrimonio por mover dinero de un bolsillo a otro.
    expect(classifyMovement("Realizaste una transferencia de S/ 110.00 desde tu Clasica. Transferencia entre mis cuentas"))
      .toEqual({ movementType: "transfer", confidence: "high" });
    expect(classifyMovement("Operación realizada\tTransferencia entre mis cuentas"))
      .toEqual({ movementType: "transfer", confidence: "high" });
  });

  it("ignora tildes y mayúsculas", () => {
    expect(classifyMovement("OPERACIÓN REALIZADA CONSUMO")).toEqual({ movementType: "expense", confidence: "high" });
  });

  it("devuelve null cuando no hay verbo de operación", () => {
    expect(classifyMovement("Tu estado de cuenta ya está disponible")).toBeNull();
  });
});

describe("comprobantes BCP reenviados desde Gmail", () => {
  it("lee el remitente con nombre, importe, empresa y fecha real", () => {
    expect(parseReceiptEmail({
      from: "BCP Notificaciones <notificaciones@notificacionesbcp.com.pe>",
      subject: "Constancia de consumo",
      text: "Realizaste un consumo de S/ 155.37 con tu Tarjeta de Débito BCP.\nEmpresa\tCOMERCIO FICTICIO\nFecha y hora\t03 de octubre de 2026 - 11:01 AM\nNúmero de operación\t100004",
    })).toMatchObject({ amount: 155.37, description: "COMERCIO FICTICIO", occurredAt: "2026-10-03T16:01:00.000Z", operationNumber: "100004" });
  });
  it("lee comprobantes que solo traen HTML y columnas separadas", () => {
    expect(parseReceiptEmail({
      from: BCP_CONSUMO.from, subject: BCP_CONSUMO.subject, text: "",
      html: '<style>NO COMERCIO</style><p>Realizaste un consumo de S/&nbsp;44.90.</p><table><tr><td>Empresa</td><td>COMERCIO FICTICIO</td></tr><tr><td>Fecha y hora</td><td>03 de octubre de 2026 - 06:24 PM</td></tr></table>',
    })).toMatchObject({ amount: 44.9, description: "COMERCIO FICTICIO", occurredAt: "2026-10-03T23:24:00.000Z" });
  });
  it("no convierte cualquier transferencia a otra persona en una transferencia propia", () => {
    expect(classifyMovement("Realizaste una transferencia de S/ 500.00 a otra persona")).toBeNull();
  });
  it("rechaza dominios parecidos aunque incluyan nombre de banco", () => {
    expect(parseReceiptEmail({ ...BCP_CONSUMO, from: "BCP <notificaciones@notificacionesbcp.com.pe.falso.test>" })).toBeNull();
  });
  it("maneja medianoche, mediodía, Yape y fechas imposibles sin depender del servidor", () => {
    expect(extractOperationDate("Fecha y Hora de la operación\t27 julio 2026 - 08:29 p. m.")).toBe("2026-07-28T01:29:00.000Z");
    expect(extractOperationDate("Fecha y hora\t03 de Octubre de 2026 - 12:00 AM")).toBe("2026-10-03T05:00:00.000Z");
    expect(extractOperationDate("Fecha y hora\t03 de Octubre de 2026 - 12:00 PM")).toBe("2026-10-03T17:00:00.000Z");
    expect(extractOperationDate("Fecha y hora\t31 febrero 2026 - 11:00 AM")).toBeNull();
  });
  it("separa números de operación reutilizados por otro banco o día", () => {
    const operation = { operationNumber: "100001", messageId: null, bank: "bcp_email", operationDate: "2026-10-03" };
    expect(buildDedupeKey(operation)).not.toBe(buildDedupeKey({ ...operation, bank: "yape_email" }));
    expect(buildDedupeKey(operation)).not.toBe(buildDedupeKey({ ...operation, operationDate: "2026-10-04" }));
  });
  it("solo extrae tokens de destinatarios en el dominio configurado", () => {
    const token = "0123456789abcdef0123456789abcdef";
    expect(extractAliasToken([`recibos+${token}@recibos.darkmoney.company`])).toBe(token);
    expect(extractAliasToken([`recibos+${token}@otro.test`])).toBeNull();
  });
});

describe("parseReceiptEmail", () => {
  it("lee yapeos BCP con la persona de Enviado a y conserva su fecha", () => {
    expect(parseReceiptEmail(BCP_YAPEO)).toMatchObject({ movementType: "expense", amount: 92.1,
      description: "Beneficiario Ficticio", occurredAt: "2026-09-27T18:52:00.000Z", operationNumber: "100005" });
  });

  it("lee pagos Yape en comercios con entidades HTML sin inventar un número de operación", () => {
    expect(parseReceiptEmail(YAPE_COMERCIO)).toMatchObject({ movementType: "expense", amount: 26.5,
      description: "CINEPLANET", occurredAt: "2026-09-05T21:18:00.000Z", operationNumber: null });
  });

  it("lee el formato Yape con monto en otra celda y fecha de octubre", () => {
    expect(parseReceiptEmail({ ...YAPE_ENVIADO, text: YAPE_ENVIADO.text
      .replace("180.00", "50.00").replace("27 julio 2026 - 08:29 p. m.", "04 octubre 2026 - 09:23 a. m.") }))
      .toMatchObject({ amount: 50, occurredAt: "2026-10-04T14:23:00.000Z", description: "Beneficiario F*" });
  });
  it("parsea un yapeo de salida (correo real)", () => {
    // El remitente real es @yape.pe, NO @yape.com.pe.
    // La descripción sale de "Nombre del Beneficiario": Yape no trae campo "Empresa".
    expect(parseReceiptEmail(YAPE_ENVIADO)).toMatchObject({
      movementType: "expense",
      amount: 180,
      currencyCode: "PEN",
      description: "Beneficiario F*",
      financialAppKey: "yape_email",
      appLabel: "Yape",
    });
  });

  it("parsea un consumo con tarjeta BCP (correo real)", () => {
    // El remitente real es @notificacionesbcp.com.pe, NO @bcp.com.pe.
    // La descripción sale del campo tabulado "Empresa", sin el punto final.
    expect(parseReceiptEmail(BCP_CONSUMO)).toMatchObject({
      movementType: "expense",
      amount: 52.5,
      description: "CINEPLANET",
      financialAppKey: "bcp_email",
    });
  });

  it("trata la transferencia entre cuentas propias como transfer (correo real)", () => {
    expect(parseReceiptEmail(BCP_TRANSFERENCIA)).toMatchObject({
      movementType: "transfer",
      amount: 110,
      description: "Transferencia BCP",
    });
  });

  it("no deja que el aviso legal del pie se cuele como comercio", () => {
    // En el correo real de Yape el aviso arranca en el carácter 418 y la ventana era 400:
    // 18 de margen. Este caso lo empuja dentro de la ventana a propósito.
    const result = parseReceiptEmail({
      from: "notificaciones@yape.pe",
      subject: "Constancia",
      text: "Yapeo exitoso por S/ 30.00.\nEn nuestras comunicaciones nunca incluiremos links.",
    });
    expect(result?.description).not.toContain("comunicaciones");
  });

  it("ignora remitentes desconocidos aunque traigan monto y verbo", () => {
    // Un dominio parecido no basta: es la defensa contra sugerencias inyectadas.
    expect(parseReceiptEmail({
      from: "atacante@yape-falso.pe",
      subject: "Constancia de Yapeo",
      text: "¡Acabas de yapear exitosamente!\nS/\t9999.00",
    })).toBeNull();
  });

  it("ignora correos del banco sin verbo de operación", () => {
    expect(parseReceiptEmail({
      from: "notificaciones@notificacionesbcp.com.pe",
      subject: "Estado de cuenta",
      text: "Tu estado de cuenta de S/ 1,000.00 ya está disponible.",
    })).toBeNull();
  });
});

describe("extractOperationNumber", () => {
  it("lee la forma larga de BCP y la abreviada de Yape", () => {
    expect(extractOperationNumber(BCP_CONSUMO.text)).toBe("100001");
    // Yape abrevia con la ordinal masculina: "Nº de operación".
    expect(extractOperationNumber(YAPE_ENVIADO.text)).toBe("100003");
  });

  it("devuelve null si el correo no numera la operación", () => {
    expect(extractOperationNumber("Pagaste S/ 30.00 en RENIEC")).toBeNull();
  });
});

describe("buildDedupeKey", () => {
  it("prefiere el número de operación del banco", () => {
    expect(buildDedupeKey({ operationNumber: "761119", messageId: "<a@mail.gmail.com>" }))
      .toBe("email:op:761119");
  });

  it("deduplica el mismo correo reenviado dos veces (Gmail cambia el Message-ID)", () => {
    const primero = buildDedupeKey({ operationNumber: "761119", messageId: "<a@mail.gmail.com>" });
    const reenvio = buildDedupeKey({ operationNumber: "761119", messageId: "<b@mail.gmail.com>" });
    expect(primero).toBe(reenvio);
  });

  it("usa el Message-ID cuando el correo no trae número de operación", () => {
    expect(buildDedupeKey({ operationNumber: null, messageId: "<abc123@mail.gmail.com>" }))
      .toBe("email:<abc123@mail.gmail.com>");
  });

  it("cae a un hash del contenido si no hay ninguno de los dos", () => {
    const a = buildDedupeKey({ operationNumber: null, messageId: null, content: "Pagaste S/ 30" });
    const b = buildDedupeKey({ operationNumber: null, messageId: null, content: "Pagaste S/ 30" });
    const c = buildDedupeKey({ operationNumber: null, messageId: null, content: "Pagaste S/ 31" });
    expect(a).toBe(b); // mismo contenido -> misma clave (el reintento no duplica)
    expect(a).not.toBe(c);
    expect(a.startsWith("email:sha:")).toBe(true);
  });
});
