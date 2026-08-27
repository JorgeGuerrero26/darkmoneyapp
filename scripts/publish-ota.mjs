#!/usr/bin/env node
/**
 * Publica una actualización OTA en los DOS runtimes vivos, en un solo comando.
 *
 * ## Por qué existe
 *
 * El iPhone corre un IPA firmado a mano cuyo `runtimeVersion` quedó congelado en 1.0.8,
 * mientras el repo va en 1.0.9. Como la política de runtime es `appVersion`, una publicación
 * normal solo alcanza a 1.0.9: **el iPhone se queda atrás en silencio**, sin ningún error, y
 * la única señal es que el usuario reporta que un arreglo "no llegó".
 *
 * Así que cada cambio hay que publicarlo dos veces, cambiando `app.json` en medio. Hacerlo a
 * mano es un ritual de cinco pasos donde olvidar el segundo no avisa de nada. Este script lo
 * hace entero y **restaura `app.json` pase lo que pase**, incluso si la publicación falla.
 *
 * ## Cuándo borrar esto
 *
 * En cuanto exista un IPA nuevo con runtime 1.0.9 — o sea, cuando haya cuenta de Apple
 * Developer y `eas build --platform ios` pueda correr desde Windows. Ese día: quitar
 * FROZEN_RUNTIME, y este script se vuelve un `eas update` normal.
 *
 * ## Uso
 *
 *   npm run ota -- "descripcion del cambio"
 *   npm run ota -- "descripcion" --dry-run     # enseña lo que haría, sin publicar
 */
import { execFileSync } from "node:child_process";
import { readFileSync, writeFileSync } from "node:fs";

const APP_JSON = "app.json";
const CHANNEL = "preview";

/**
 * Runtime del IPA que corre el iPhone. `null` desactiva el segundo publicado.
 * Ver el bloque "Cuándo borrar esto" de arriba.
 */
const FROZEN_RUNTIME = "1.0.8";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const message = args.filter((a) => !a.startsWith("--")).join(" ").trim();

if (!message) {
  console.error("Falta el mensaje.\n  npm run ota -- \"descripcion del cambio\"");
  process.exit(1);
}

/** Lee la versión sin parsear el JSON: así se conservan formato y saltos de línea al escribir. */
function readVersion(source) {
  const match = /"version":\s*"([^"]+)"/.exec(source);
  if (!match) throw new Error("app.json no tiene un campo version reconocible.");
  return match[1];
}

function setVersion(source, from, to) {
  const next = source.replace(`"version": "${from}"`, `"version": "${to}"`);
  if (next === source) throw new Error(`No se pudo cambiar la version ${from} -> ${to}.`);
  return next;
}

function publish(runtime) {
  console.log(`\n── publicando runtime ${runtime}`);
  if (dryRun) {
    console.log("   (dry-run: no se publica)");
    return;
  }
  execFileSync(
    "npx",
    ["eas-cli", "update", "--channel", CHANNEL, "--message", message, "--non-interactive"],
    { stdio: "inherit", shell: process.platform === "win32" },
  );
}

// El original se guarda ENTERO, no solo la versión: si algo peta a mitad, se reescribe tal
// cual estaba, con sus mismos saltos de línea (app.json es CRLF en la máquina Windows y
// reescribirlo con LF ensucia el git status sin que nadie entienda por qué).
const original = readFileSync(APP_JSON, "utf8");
const version = readVersion(original);

console.log(`Mensaje:  ${message}`);
console.log(`Version:  ${version}${FROZEN_RUNTIME ? `  (+ runtime congelado ${FROZEN_RUNTIME})` : ""}`);

let restored = false;
try {
  publish(version);

  if (FROZEN_RUNTIME && FROZEN_RUNTIME !== version) {
    writeFileSync(APP_JSON, setVersion(original, version, FROZEN_RUNTIME));
    try {
      publish(FROZEN_RUNTIME);
    } finally {
      writeFileSync(APP_JSON, original);
      restored = true;
    }
  }
} finally {
  // Cinturón y tirantes: si el fallo ocurrió entre el write y el try interno, esto lo cubre.
  if (!restored && readFileSync(APP_JSON, "utf8") !== original) writeFileSync(APP_JSON, original);
}

if (readFileSync(APP_JSON, "utf8") !== original) {
  console.error("\napp.json NO quedó como estaba. Revisar antes de commitear.");
  process.exit(1);
}

console.log(`\napp.json intacto en ${version}.`);
console.log(dryRun ? "Dry-run terminado." : "Publicado en los dos runtimes.");
