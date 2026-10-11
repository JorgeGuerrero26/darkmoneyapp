/**
 * ESLint (flat config, el único formato que entiende ESLint 10).
 *
 * `npm run lint` fallaba con "no encuentra eslint.config.*" y por eso las reglas del proyecto
 * nunca se comprobaban. Esta configuración es deliberadamente corta: solo lo que atrapa errores
 * reales —los ganchos de React mal usados y los errores de TypeScript que el compilador deja
 * pasar— y no reglas de estilo, que ya fija el código existente.
 */
const tsParser = require("@typescript-eslint/parser");
const tsPlugin = require("@typescript-eslint/eslint-plugin");
const reactHooks = require("eslint-plugin-react-hooks");

module.exports = [
  {
    ignores: [
      "node_modules/**",
      ".expo/**",
      ".tmp/**",
      "dist/**",
      "android/**",
      "ios/**",
      "supabase/functions/**",
      "plugins/**",
      "scripts/**",
      "**/*.d.ts",
    ],
  },
  {
    files: ["**/*.{js,jsx,ts,tsx}"],
    languageOptions: {
      parser: tsParser,
      parserOptions: { ecmaVersion: "latest", sourceType: "module", ecmaFeatures: { jsx: true } },
    },
    plugins: { "@typescript-eslint": tsPlugin, "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
      "@typescript-eslint/no-unused-vars": ["warn", { argsIgnorePattern: "^_", varsIgnorePattern: "^_" }],
    },
  },
];
