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
 * Cuando exista un IPA nuevo con el runtime actual — o sea, cuando haya cuenta de Apple
 * Developer y `eas build --platform ios` pueda correr desde Windows —, sacar 1.0.8 de
 * LEGACY_RUNTIMES. Cuando los compañeros instalen el APK nuevo, sacar también 1.0.9. Con la
 * lista vacía, este script se vuelve un `eas update` normal y se puede borrar.
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
 * Runtimes VIEJOS que siguen vivos ahí fuera y a los que también hay que publicar.
 *
 *   1.0.9 — el APK que tienen los compañeros. Mientras no instalen el nuevo, esta es su
 *           única vía de recibir arreglos.
 *   1.0.8 — el IPA del iPhone, congelado hasta que haya cuenta de Apple Developer.
 *
 * Se quita una entrada de aquí SOLO cuando conste que ya nadie corre ese binario. Dejar una
 * de más solo gasta un publicado; quitarla antes de tiempo deja a alguien tirado en silencio.
 */
const LEGACY_RUNTIMES = ["1.0.9", "1.0.8"];

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

const pending = LEGACY_RUNTIMES.filter((runtime) => runtime !== version);

console.log(`Mensaje:  ${message}`);
console.log(`Runtimes: ${[version, ...pending].join(", ")}`);

let restored = true;
try {
  publish(version);

  for (const runtime of pending) {
    restored = false;
    writeFileSync(APP_JSON, setVersion(original, version, runtime));
    try {
      publish(runtime);
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
