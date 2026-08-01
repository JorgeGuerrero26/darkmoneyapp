import { parseBoldSegments } from "../assistant-text";

describe("parseBoldSegments", () => {
  it("separa negritas **asi** del resto del texto", () => {
    expect(parseBoldSegments("gastaste **S/ 4,237.76** en 7 movimientos")).toEqual([
      { text: "gastaste ", bold: false },
      { text: "S/ 4,237.76", bold: true },
      { text: " en 7 movimientos", bold: false },
    ]);
  });

  it("texto sin marcas queda tal cual y asteriscos sueltos no rompen", () => {
    expect(parseBoldSegments("sin negritas")).toEqual([{ text: "sin negritas", bold: false }]);
    expect(parseBoldSegments("2 * 3 ** raro")).toEqual([{ text: "2 * 3 ** raro", bold: false }]);
  });

  it("multiples negritas en una linea", () => {
    const segments = parseBoldSegments("**a** y **b**");
    expect(segments.filter((s) => s.bold).map((s) => s.text)).toEqual(["a", "b"]);
  });
});
