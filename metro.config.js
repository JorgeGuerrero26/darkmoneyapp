const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const config = getDefaultConfig(__dirname);

// Paquete compartido hermano (@darkmoney/shared) fuera del root del proyecto.
// Metro necesita vigilar su carpeta y resolver el alias explícitamente, porque
// por defecto no busca módulos fuera de projectRoot.
const sharedRoot = path.resolve(__dirname, "../DarkMoneyShared");

config.watchFolders = [...(config.watchFolders ?? []), sharedRoot];

config.resolver.extraNodeModules = {
  ...(config.resolver.extraNodeModules ?? {}),
  "@darkmoney/shared": sharedRoot,
};

// Asegura que cualquier dependencia se resuelva contra el node_modules del móvil.
config.resolver.nodeModulesPaths = [
  ...(config.resolver.nodeModulesPaths ?? []),
  path.resolve(__dirname, "node_modules"),
];

module.exports = config;
