// Preflight para builds de EAS: si hay cambios NATIVOS desde el último bump de
// versión en app.json, exige bumpear antes de compilar. Evita el incidente
// 2026-07-11 (tres binarios distintos etiquetados 1.0.1: imposible saber qué
// APK tiene cada teléfono, y runtimeVersion/OTA anclados a la versión).
//
// Uso: node scripts/preflight-native-version.mjs   (encadenado en npm run build:android)
//
// Los comandos van con execFileSync + array de argumentos, nunca con una cadena
// de shell: en Windows execSync la ejecuta con cmd.exe, donde las comillas
// simples son literales y el patrón de -G llegaba corrupto (devolvía vacío y el
// preflight abortaba todos los builds).
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const git = (...args) => execFileSync("git", args, { encoding: "utf8" }).trim();

// Último commit que tocó la línea "version" de app.json (bump o setup).
const lastBump = git("log", "-1", "--format=%H", '-G"version"\\s*:', "--", "app.json");
if (!lastBump) {
  console.error("preflight: no se encontró ningún bump de versión en app.json");
  process.exit(1);
}

// Rutas que obligan APK nuevo (ver CLAUDE.md / docs/BUILD_APK.md).
const NATIVE_PATHS = [
  "plugins/",
  "android/app/src/",
];

const appConfig = JSON.parse(readFileSync("app.json", "utf8")).expo;

/**
 * Los assets que se hornean en el binario: icono, icono adaptativo y splash.
 *
 * No viajan por OTA — un icono nuevo necesita APK nuevo — y hasta el 2026-09-07 el preflight
 * no los miraba: se podía cambiar el icono y compilar un segundo binario etiquetado con la
 * misma versión, que es justo el incidente que este script existe para evitar.
 *
 * Se resuelven leyendo app.json en vez de listarlos a mano: así apuntar `ios.icon` a un archivo
 * nuevo queda cubierto sin tener que acordarse de tocar esta lista.
 */
function bakedAssets(config) {
  const paths = [
    config?.icon,
    config?.ios?.icon,
    config?.android?.icon,
    config?.android?.adaptiveIcon?.foregroundImage,
    config?.android?.adaptiveIcon?.backgroundImage,
    config?.android?.adaptiveIcon?.monochromeImage,
    config?.notification?.icon,
    ...(config?.plugins ?? [])
      .filter((plugin) => Array.isArray(plugin) && plugin[0] === "expo-splash-screen")
      .flatMap((plugin) => [plugin[1]?.image, plugin[1]?.dark?.image]),
  ];
  return [...new Set(paths.filter((value) => typeof value === "string"))]
    .map((value) => value.replace(/^\.\//, ""));
}

NATIVE_PATHS.push(...bakedAssets(appConfig));

const changed = git(
  "log",
  "--name-only",
  "--format=",
  `${lastBump}..HEAD`,
  "--",
  ...NATIVE_PATHS,
)
  .split("\n")
  .filter(Boolean);

// También cuenta lo NO commiteado (working tree) en esas rutas.
const dirty = git("status", "--porcelain", "--", ...NATIVE_PATHS)
  .split("\n")
  .filter(Boolean);

if (changed.length || dirty.length) {
  const version = appConfig.version;
  console.error(
    `preflight: hay cambios nativos posteriores al último bump (v${version}):`,
  );
  for (const f of [...new Set([...changed, ...dirty.map((l) => l.replace(/^..\s+/, ""))])].slice(0, 10)) {
    console.error(`  - ${f}`);
  }
  console.error(
    "Bumpea version + android.versionCode en app.json (y commitea) antes de compilar.",
  );
  process.exit(1);
}

console.log("preflight OK: sin cambios nativos desde el último bump de versión.");
