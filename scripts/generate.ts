/**
 * Generates shiki-data.json and addon config from config.json.
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

await Bun.write(
  `${ADDON_DIR}/shiki-data.json`,
  JSON.stringify(
    { version: shikiVersion, languages: languageNames, themes: themeNames },
  ) + "\n",
);

await Bun.write(
  `${ADDON_DIR}/config.json`,
  JSON.stringify(
    {
      languages: config.languages,
      themes: config.themes,
      cardless: config.cardless ?? false,
    },
    null,
    2,
  ) + "\n",
);

const files = readdirSync(ADDON_DIR);
let cleaned = 0;
for (const file of files) {
  if (file.startsWith("_lang-") || file.startsWith("_theme-")) {
    rmSync(`${ADDON_DIR}/${file}`);
    cleaned++;
  }
}

console.log(
  `✓ Generated shiki-data.json (${languageNames.length} languages, ${themeNames.length} themes)`,
);
console.log(`✓ Updated ${ADDON_DIR}/config.json`);
console.log(`✓ SHIKI_VERSION = "${shikiVersion}"`);
if (cleaned > 0) {
  console.log(`✓ Cleaned ${cleaned} stray language/theme files`);
}
