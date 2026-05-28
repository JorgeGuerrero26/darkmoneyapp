#!/usr/bin/env node
/**
 * Lint custom: detecta hex hardcoded en código TS/TSX bajo features/, components/, app/.
 *
 * Regla: usar tokens de `constants/theme.ts` (COLORS, CHART_PALETTE, BADGE_TONES,
 * EXTENDED_PALETTE, GLASS, SURFACE) en lugar de strings hex literales.
 *
 * Política: baseline snapshot. La codebase tiene deuda histórica (~95 hex en
 * archivos pre-refactor). El script bloquea SOLO violaciones nuevas comparando
 * contra `scripts/no-hex-baseline.json`. Para limpiar deuda existente, eliminar
 * entradas del baseline y arreglar el código.
 *
 * Excepciones permitidas:
 *   - El propio constants/theme.ts (define los tokens).
 *   - rgba(...) y hsla(...) — son canales explícitos, no hex.
 *   - Comentarios.
 *   - Strings dentro de `tests/**`.
 *   - Líneas marcadas con `// allow-hex` (escape hatch explícito).
 *
 * Uso:
 *   node scripts/check-no-hex.mjs              # falla si hay violaciones nuevas
 *   node scripts/check-no-hex.mjs --baseline   # regenera el baseline (commit con cuidado)
 */

import { readFileSync, readdirSync, statSync, writeFileSync, existsSync } from "node:fs";
import { join, relative, sep, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = process.cwd();
const SCAN_DIRS = ["features", "components", "app", "hooks", "lib", "services"];
const EXCLUDE_PATHS = [
  "constants/theme.ts",
  "node_modules",
  ".tmp",
  "tests",
];
const EXT_OK = new Set([".ts", ".tsx"]);

// Match #RGB, #RRGGBB, #RRGGBBAA, dentro de strings.
const HEX_REGEX = /["'`]#[0-9A-Fa-f]{3,8}["'`]/g;

const violations = [];

function shouldExclude(filePath) {
  const rel = relative(ROOT, filePath).split(sep).join("/");
  return EXCLUDE_PATHS.some((excl) => rel.includes(excl));
}

function walk(dir) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return;
  }
  for (const entry of entries) {
    const full = join(dir, entry);
    if (shouldExclude(full)) continue;
    const stats = statSync(full);
    if (stats.isDirectory()) {
      walk(full);
    } else if (stats.isFile()) {
      const ext = full.slice(full.lastIndexOf("."));
      if (EXT_OK.has(ext)) inspectFile(full);
    }
  }
}

function inspectFile(filePath) {
  const content = readFileSync(filePath, "utf8");
  const lines = content.split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (trimmed.startsWith("//") || trimmed.startsWith("*")) continue;
    if (line.includes("allow-hex")) continue;
    const matches = line.match(HEX_REGEX);
    if (!matches) continue;
    for (const match of matches) {
      violations.push({
        file: relative(ROOT, filePath).split(sep).join("/"),
        line: i + 1,
        match,
        context: trimmed.slice(0, 100),
      });
    }
  }
}

for (const dir of SCAN_DIRS) {
  walk(join(ROOT, dir));
}

const __dirname = dirname(fileURLToPath(import.meta.url));
const BASELINE_PATH = join(__dirname, "no-hex-baseline.json");
const REGEN = process.argv.includes("--baseline");

function violationKey(v) {
  return `${v.file}::${v.match}`;
}

if (REGEN) {
  const baseline = {};
  for (const v of violations) {
    const key = v.file;
    if (!baseline[key]) baseline[key] = [];
    baseline[key].push({ line: v.line, match: v.match });
  }
  writeFileSync(BASELINE_PATH, JSON.stringify(baseline, null, 2) + "\n");
  console.log(`check-no-hex: baseline regenerado con ${violations.length} entrada(s)`);
  console.log(`  guardado en ${relative(ROOT, BASELINE_PATH)}`);
  process.exit(0);
}

let baseline = {};
if (existsSync(BASELINE_PATH)) {
  try {
    baseline = JSON.parse(readFileSync(BASELINE_PATH, "utf8"));
  } catch (e) {
    console.error(`check-no-hex: no se pudo leer el baseline: ${e.message}`);
    process.exit(2);
  }
}

const allowedKeys = new Set();
for (const [file, entries] of Object.entries(baseline)) {
  for (const entry of entries) {
    allowedKeys.add(`${file}::${entry.match}`);
  }
}

const newViolations = violations.filter((v) => !allowedKeys.has(violationKey(v)));

if (newViolations.length === 0) {
  const total = violations.length;
  const baselined = total;
  console.log(`check-no-hex: OK — sin hex nuevos. (${baselined} en baseline histórico)`);
  process.exit(0);
}

console.error(`check-no-hex: ${newViolations.length} violacion(es) NUEVAS encontrada(s):\n`);
for (const v of newViolations) {
  console.error(`  ${v.file}:${v.line}  ${v.match}`);
  console.error(`    ${v.context}\n`);
}
console.error(`\nFix: reemplaza por un token de constants/theme.ts (COLORS, EXTENDED_PALETTE,`);
console.error(`     CHART_PALETTE, BADGE_TONES, GLASS, SURFACE) o agrega "// allow-hex" si es`);
console.error(`     un caso justificado (ej: shadow color).`);
console.error(`\nSi limpiaste deuda histórica, regenera el baseline:`);
console.error(`     npm run check:no-hex -- --baseline`);
process.exit(1);
