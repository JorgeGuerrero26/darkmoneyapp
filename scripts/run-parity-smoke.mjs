// Runner del smoke de paridad. El smoke se compila a ESM en .tmp/ y consume
// @darkmoney/shared desde node_modules. Marcamos .tmp como ESM para que node lo
// trate como módulo (el package.json raíz del móvil es CommonJS y no aplica
// dentro de .tmp).
import { writeFileSync } from "node:fs";
import { execFileSync } from "node:child_process";

writeFileSync(".tmp/parity-tests/package.json", JSON.stringify({ type: "module" }));

execFileSync("node", [".tmp/parity-tests/tests/parity/parity-smoke.js"], {
  stdio: "inherit",
});
