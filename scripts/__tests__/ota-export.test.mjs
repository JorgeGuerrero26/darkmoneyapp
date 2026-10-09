import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { REQUIRED_OTA_FONTS, REQUIRED_OTA_SOURCES, validateOtaExport } from "../lib/validate-ota-export.mjs";

function fixture(t, alter = () => {}) {
  const root = mkdtempSync(join(tmpdir(), "darkmoney-ota-"));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, "assets"));
  const assets = REQUIRED_OTA_FONTS.map((name, index) => ({ path: `assets/font${index}`, ext: "ttf" }));
  const assetMap = Object.fromEntries(REQUIRED_OTA_FONTS.map((name, index) => [name, { name, type: "ttf", fileHashes: [`font${index}`] }]));
  const metadata = { fileMetadata: {} };
  const maps = {};
  for (const platform of ["ios", "android"]) {
    metadata.fileMetadata[platform] = { bundle: `${platform}.hbc`, assets: [...assets] };
    maps[platform] = { sources: REQUIRED_OTA_SOURCES.map((source) => "/" + source) };
    writeFileSync(join(root, `${platform}.hbc`), "bundle");
  }
  for (const asset of assets) writeFileSync(join(root, asset.path), "font");
  alter({ metadata, maps, assetMap, root });
  writeFileSync(join(root, "metadata.json"), JSON.stringify(metadata));
  writeFileSync(join(root, "assetmap.json"), JSON.stringify(assetMap));
  for (const [platform, map] of Object.entries(maps)) writeFileSync(join(root, `${platform}.hbc.map`), JSON.stringify(map));
  return root;
}

test("accepts complete iOS and Android exports, including Windows and indexed maps", (t) => {
  const root = fixture(t, ({ maps }) => {
    maps.ios.sources = maps.ios.sources.map((source) => source.replaceAll("/", "\\"));
    maps.android = { sections: [{ map: maps.android }] };
  });
  assert.equal(validateOtaExport(root).length, 2);
});

test("blocks an empty Router export even when Metro succeeded", (t) => {
  const root = fixture(t, ({ maps }) => { maps.ios.sources = ["/node_modules/expo-router/entry.js"]; });
  assert.throws(() => validateOtaExport(root), /faltan pantallas/);
});

test("blocks a font present locally but absent from the uploaded platform assets", (t) => {
  const root = fixture(t, ({ metadata }) => { metadata.fileMetadata.android.assets = []; });
  assert.throws(() => validateOtaExport(root), /android: falta la fuente/);
});

test("blocks a missing native platform", (t) => {
  const root = fixture(t, ({ metadata }) => { delete metadata.fileMetadata.android; });
  assert.throws(() => validateOtaExport(root), /falta la plataforma android/);
});

test("blocks missing bundles and resources", (t) => {
  for (const file of ["ios.hbc", "assets/font0"]) {
    const root = fixture(t, ({ root: directory }) => { rmSync(join(directory, file)); });
    assert.throws(() => validateOtaExport(root), /ENOENT/);
  }
});
