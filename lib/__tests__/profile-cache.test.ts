/**
 * El perfil guardado para arrancar sin esperar a la red. Lo que se protege: que nunca se devuelva
 * el perfil de OTRO usuario, y que un dato corrupto no rompa el arranque.
 */
jest.mock("@react-native-async-storage/async-storage", () => ({}));

import { pickCachedProfile } from "../profile-cache";

const perfil = {
  id: "u-1",
  email: "a@b.pe",
  fullName: "Adrian Guerrero",
  initials: "AG",
  baseCurrencyCode: "PEN",
  timezone: "America/Lima",
  avatarUrl: null,
};

const guardado = (userId: string, profile: unknown = perfil) => JSON.stringify({ userId, profile });

describe("pickCachedProfile", () => {
  it("devuelve el perfil guardado del mismo usuario", () => {
    expect(pickCachedProfile(guardado("u-1"), "u-1")).toEqual(perfil);
  });

  it("nunca devuelve el perfil de otro usuario", () => {
    expect(pickCachedProfile(guardado("u-1"), "u-2")).toBeNull();
  });

  it("rechaza un guardado cuyo perfil no coincide con su propio dueño", () => {
    expect(pickCachedProfile(guardado("u-2", { ...perfil, id: "u-1" }), "u-2")).toBeNull();
  });

  it("sin moneda base no sirve: la moneda es lo que pinta todas las cifras", () => {
    expect(pickCachedProfile(guardado("u-1", { ...perfil, baseCurrencyCode: "" }), "u-1")).toBeNull();
  });

  it("vacío o corrupto no rompe el arranque", () => {
    expect(pickCachedProfile(null, "u-1")).toBeNull();
    expect(pickCachedProfile("{no es json", "u-1")).toBeNull();
    expect(pickCachedProfile(guardado("u-1"), "")).toBeNull();
  });
});
