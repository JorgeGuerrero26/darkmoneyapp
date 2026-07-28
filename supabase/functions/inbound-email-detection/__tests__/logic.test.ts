import { classifyMovement, extractAmount, parseReceiptEmail } from "../logic";
import { BCP_CONSUMO, BCP_TRANSFERENCIA, YAPE_ENVIADO } from "./fixtures/emails";

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
    expect(classifyMovement("Realizaste una transferencia de S/ 110.00 desde tu Clasica"))
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

describe("parseReceiptEmail", () => {
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
