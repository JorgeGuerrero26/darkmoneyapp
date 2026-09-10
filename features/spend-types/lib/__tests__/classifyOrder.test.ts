import { classifyRowNote, orderCategoriesToClassify } from "../classifyOrder";

/** El reparto real del gasto de los ultimos tres meses, medido antes de decidir el orden. */
const REAL = new Map<number, number>([
  [3, 6141.25], // Tecnologia
  [4, 2234.89], // Otros
  [5, 2227.41], // Servicios
  [1, 1476.92], // Alimentacion
  [6, 739.99],  // Salud
  [2, 505.06],  // Transporte
  [9, 399.90],  // Ropa
  [10, 355.90], // Diversion
  [11, 84.00],  // Comisiones bancarias
  [7, 15.20],   // Hogar
  [12, 5.00],   // Suscripciones
]);
const CATS = [
  { id: 1, name: "Alimentacion" },
  { id: 2, name: "Transporte" },
  { id: 3, name: "Tecnologia" },
  { id: 4, name: "Otros" },
  { id: 5, name: "Servicios" },
  { id: 6, name: "Salud" },
  { id: 7, name: "Hogar" },
  { id: 8, name: "Educacion" }, // sin gasto en el periodo
  { id: 9, name: "Ropa" },
  { id: 10, name: "Diversion" },
  { id: 11, name: "Comisiones bancarias" },
  { id: 12, name: "Suscripciones" },
];

describe("orderCategoriesToClassify", () => {
  it("abre por la que decide casi la mitad del gasto, no por la primera del abecedario", () => {
    const rows = orderCategoriesToClassify(CATS, REAL);
    expect(rows.slice(0, 3).map((row) => row.category.name)).toEqual([
      "Tecnologia",
      "Otros",
      "Servicios",
    ]);
  });

  it("clasificar las cinco primeras cubre el 90% del gasto", () => {
    const rows = orderCategoriesToClassify(CATS, REAL);
    const cubierto = rows.slice(0, 5).reduce((sum, row) => sum + row.share, 0);
    expect(Math.round(cubierto * 100)).toBe(90);
  });

  it("las que no movieron nada quedan al final, pero siguen estando", () => {
    const rows = orderCategoriesToClassify(CATS, REAL);
    expect(rows).toHaveLength(12);
    expect(rows[rows.length - 1].category.name).toBe("Educacion");
    expect(rows[rows.length - 1].share).toBe(0);
  });

  it("sin datos de gasto conserva el orden que le den, alfabetico por desempate", () => {
    const rows = orderCategoriesToClassify(CATS, new Map());
    expect(rows[0].category.name).toBe("Alimentacion");
  });
});

describe("classifyRowNote", () => {
  it("dice el peso cuando mueve la aguja", () => {
    expect(classifyRowNote(0.433)).toBe("43% de tu gasto");
  });

  it("y se calla cuando no", () => {
    expect(classifyRowNote(0.001)).toBeNull();
    expect(classifyRowNote(0)).toBeNull();
  });
});
