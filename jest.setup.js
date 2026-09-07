/**
 * AsyncStorage es un módulo nativo: en un test unitario no existe y su import revienta la suite
 * entera antes de la primera línea. La librería trae su propio doble para esto; se usa ese en
 * vez de esparcir jest.mock por cada archivo que, sin saberlo, lo arrastra por una cadena de
 * imports (el registro de errores lo arrastra a media app).
 */
jest.mock("@react-native-async-storage/async-storage", () =>
  require("@react-native-async-storage/async-storage/jest/async-storage-mock"),
);
