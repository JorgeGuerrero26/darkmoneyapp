import { describePushedNotice } from "../pushed-notice";

describe("aviso de cambios enviados", () => {
  it("al volver el internet avisa, aunque sea uno solo", () => {
    expect(describePushedNotice({ applied: 1, rejected: 0 }, "network")).toBe("1 cambio enviado");
    expect(describePushedNotice({ applied: 3, rejected: 0 }, "network")).toBe("3 cambios enviados");
  });

  it("si el usuario pidió enviar, también", () => {
    expect(describePushedNotice({ applied: 2, rejected: 0 }, "manual")).toBe("2 cambios enviados");
  });

  it("un guardado normal con internet envía en silencio: avisar cada vez sería ruido", () => {
    expect(describePushedNotice({ applied: 1, rejected: 0 }, "write")).toBeNull();
    expect(describePushedNotice({ applied: 1, rejected: 0 }, "interval")).toBeNull();
  });

  it("pero si salen varios juntos, sí avisa", () => {
    expect(describePushedNotice({ applied: 4, rejected: 0 }, "foreground")).toBe("4 cambios enviados");
    expect(describePushedNotice({ applied: 2, rejected: 0 }, "write")).toBe("2 cambios enviados");
  });

  it("si no se aplicó nada, no dice nada", () => {
    expect(describePushedNotice({ applied: 0, rejected: 2 }, "network")).toBeNull();
  });
});
