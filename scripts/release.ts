import { $ } from "bun";

const pkg = await Bun.file("package.json").json();
const manifest = await Bun.file("anki_markdown/manifest.json").json();

const version = Bun.argv[2] || prompt(`Version (current: ${pkg.version}):`);
if (!version || !/^\d+\.\d+\.\d+$/.test(version)) {
  console.error("Invalid version. Use semver (e.g., 1.0.0)");
  process.exit(1);
}

const status = await $`git status --porcelain`.text();
if (status.trim()) {
  console.error("Working directory not clean");
  process.exit(1);
}

pkg.version = manifest.version = version;
await Bun.write("package.json", JSON.stringify(pkg, null, 2) + "\n");
await Bun.write(
  "anki_markdown/manifest.json",
  JSON.stringify(manifest, null, 2) + "\n",
);

await $`git add package.json anki_markdown/manifest.json`;
await $`git commit -m ${"chore: release v" + version}`;
await $`git tag ${"v" + version}`;
await $`git push && git push --tags`;

console.log(`\n✓ v${version} released`);
