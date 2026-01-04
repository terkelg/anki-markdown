/**
 * Prepares the build by generating Python constants and config from build.config.json.
 * Run before build: bun run prepare
 */
import { bundledLanguagesInfo, bundledThemesInfo } from "shiki";
import { rmSync, readdirSync } from "fs";

const ADDON_DIR = "anki_markdown";

// Build complete language list including aliases
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

// Build theme list
const themeNames = bundledThemesInfo.map((t) => t.id).sort();

// Read build config
const config = await Bun.file("build.config.json").json();

// Validate config
for (const lang of config.defaultLanguages) {
  if (!allLanguages.has(lang)) {
    console.error(`Unknown language in defaultLanguages: ${lang}`);
    console.error(`Available: ${[...allLanguages].sort().join(", ")}`);
    process.exit(1);
  }
}
const themeSet = new Set(themeNames);
for (const theme of [config.defaultThemes.light, config.defaultThemes.dark]) {
  if (!themeSet.has(theme)) {
    console.error(`Unknown theme in defaultThemes: ${theme}`);
    console.error(`Available: ${themeNames.join(", ")}`);
    process.exit(1);
  }
}

// Generate Python list formatting
function formatPyList(items: string[], indent = 4): string {
  const lines: string[] = [];
  let line = "";
  for (const item of items) {
    const quoted = `"${item}"`;
    if (line.length + quoted.length + 2 > 80 - indent) {
      lines.push(line.slice(0, -1)); // remove trailing space
      line = "";
    }
    line += quoted + ", ";
  }
  if (line) lines.push(line.slice(0, -2)); // remove trailing comma+space
  const indentStr = " ".repeat(indent);
  return lines.map((l) => indentStr + l).join("\n");
}

// Update shiki.py with generated constants
const shikiPy = await Bun.file(`${ADDON_DIR}/shiki.py`).text();

const langsMarker = /^AVAILABLE_LANGS = \[[\s\S]*?\]$/m;
const themesMarker = /^AVAILABLE_THEMES = \[[\s\S]*?\]$/m;
const versionMarker = /^SHIKI_VERSION = ".*"$/m;

const newLangs = `AVAILABLE_LANGS = [\n${formatPyList(languageNames)},\n]`;
const newThemes = `AVAILABLE_THEMES = [\n${formatPyList(themeNames)},\n]`;
const newVersion = `SHIKI_VERSION = "${config.shikiVersion}"`;

let updatedPy = shikiPy
  .replace(langsMarker, newLangs)
  .replace(themesMarker, newThemes)
  .replace(versionMarker, newVersion);

await Bun.write(`${ADDON_DIR}/shiki.py`, updatedPy);

// Update config.json
const ankiConfig = {
  languages: config.defaultLanguages,
  themes: config.defaultThemes,
};
await Bun.write(
  `${ADDON_DIR}/config.json`,
  JSON.stringify(ankiConfig, null, 2) + "\n",
);

// Clean stray language/theme files from addon directory
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
console.log(`✓ Updated config.json with defaults`);
console.log(`✓ SHIKI_VERSION = "${config.shikiVersion}"`);
if (cleaned > 0) {
  console.log(`✓ Cleaned ${cleaned} stray language/theme files`);
}
