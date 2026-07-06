module.exports = function (api) {
  api.cache(true);
  return {
    presets: ["babel-preset-expo"],
    plugins: ["react-native-reanimated/plugin"],
    env: {
      production: {
        // Quita console.log/info/debug del bundle release (40+ llamadas activas);
        // conserva warn/error porque alimentan el error-logger y diagnósticos reales.
        plugins: [["transform-remove-console", { exclude: ["error", "warn"] }]],
      },
    },
  };
};
