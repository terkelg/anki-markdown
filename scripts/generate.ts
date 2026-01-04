/**
 * Generates Python constants and addon config from config.json.
 * Shiki version is read from package.json dependencies.
 * Run: bun run generate
 */
import { bundledLanguagesInfo, bundledThemesInfo } from "shiki";
import { rmSync, readdirSync } from "fs";

const ADDON_DIR = "anki_markdown";

const pkg = await Bun.file("package.json").json();
const shikiVersion = pkg.dependencies?.shiki || pkg.dependencies?.["@shikijs/core"];

if (!shikiVersion) {
  console.error("Could not find shiki version in package.json");
  process.exit(1);
}

const allLanguages = new Set<string>();
for (const lang of bundledLanguagesInfo) {
  allLanguages.add(lang.id);
  if (lang.aliases) {
    for (const alias of lang.aliases) {
      allLanguages.add(alias);
    }
  }
}
const languageNames = [...allLanguages].sort();

const themeNames = bundledThemesInfo.map((t) => t.id).sort();

const config = await Bun.file("config.json").json();

for (const lang of config.languages) {
  if (!allLanguages.has(lang)) {
    console.error(`Unknown language: ${lang}`);
    console.error(`Available: ${languageNames.join(", ")}`);
    process.exit(1);
  }
}
const themeSet = new Set(themeNames);
for (const theme of [config.themes.light, config.themes.dark]) {
  if (!themeSet.has(theme)) {
    console.error(`Unknown theme: ${theme}`);
    console.error(`Available: ${themeNames.join(", ")}`);
    process.exit(1);
  }
}

function formatPyList(items: string[], indent = 4): string {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const quoted = `"${item}"`;
    if (line.length + quoted.length + 2 > 80 - indent) {
      lines.push(line.slice(0, -1));
      line = "";
    }
    line += quoted + ", ";
  }
  if (line) lines.push(line.slice(0, -2));
  return lines.map((l) => " ".repeat(indent) + l).join("\n");
}

const shikiPy = await Bun.file(`${ADDON_DIR}/shiki.py`).text();

const langsMarker = /^AVAILABLE_LANGS = \[[\s\S]*?\]$/m;
const themesMarker = /^AVAILABLE_THEMES = \[[\s\S]*?\]$/m;
const versionMarker = /^SHIKI_VERSION = ".*"$/m;

const newLangs = `AVAILABLE_LANGS = [\n${formatPyList(languageNames)},\n]`;
const newThemes = `AVAILABLE_THEMES = [\n${formatPyList(themeNames)},\n]`;
const newVersion = `SHIKI_VERSION = "${shikiVersion}"`;

const updatedPy = shikiPy
  .replace(langsMarker, newLangs)
  .replace(themesMarker, newThemes)
  .replace(versionMarker, newVersion);

await Bun.write(`${ADDON_DIR}/shiki.py`, updatedPy);

await Bun.write(
  `${ADDON_DIR}/config.json`,
  JSON.stringify({ languages: config.languages, themes: config.themes }, null, 2) + "\n",
);

const files = readdirSync(ADDON_DIR);
let cleaned = 0;
for (const file of files) {
  if (file.startsWith("_lang-") || file.startsWith("_theme-")) {
    rmSync(`${ADDON_DIR}/${file}`);
    cleaned++;
  }
}

console.log(`✓ Generated AVAILABLE_LANGS (${languageNames.length} languages)`);
console.log(`✓ Generated AVAILABLE_THEMES (${themeNames.length} themes)`);
console.log(`✓ Updated ${ADDON_DIR}/config.json`);
console.log(`✓ SHIKI_VERSION = "${shikiVersion}"`);
if (cleaned > 0) {
  console.log(`✓ Cleaned ${cleaned} stray language/theme files`);
}
