/**
 * Launch Anki with remote debugging and auto-open Chrome DevTools
 * for the main webview. Requires macOS and Google Chrome.
 */
import { $ } from "bun";

const addon = `${process.env.HOME}/Library/Application Support/Anki2/addons21/anki_markdown`;
const port = Number(process.argv[2]) || 9230;

// Quit Anki if already running (env var only applies on fresh launch)
const running = await $`pgrep -f Anki.app/Contents/MacOS`.quiet().nothrow();
if (running.exitCode === 0) {
  console.log("Quitting Anki...");
  await $`osascript -e 'tell application "Anki" to quit'`;
  while ((await $`pgrep -f Anki.app/Contents/MacOS`.quiet().nothrow()).exitCode === 0)
    await Bun.sleep(500);
}

// Symlink add-on
await $`ln -sfn ${process.cwd()}/anki_markdown ${addon}`;

// Launch Anki with remote debugging (invoke binary directly; `open -a` strips env vars)
const bin = "/Applications/Anki.app/Contents/MacOS/launcher";
const anki = Bun.spawn([bin], {
  env: { ...process.env, QTWEBENGINE_REMOTE_DEBUGGING: String(port) },
});
process.on("SIGINT", () => {
  anki.kill();
  process.exit();
});

// Wait for main webview target
process.stdout.write("Waiting for Anki...");
let ws: string | undefined;
const deadline = Date.now() + 30_000;
while (!ws) {
  if (Date.now() > deadline) {
    console.error("\nTimed out waiting for Anki main webview");
    process.exit(1);
  }
  try {
    const targets: any[] = await fetch(`http://localhost:${port}/json`).then(
      (r) => r.json(),
    );
    const main = targets.find((t) => t.title === "main webview");
    if (main) ws = main.webSocketDebuggerUrl.replace("ws://", "");
  } catch {
    // Connection refused while Anki is starting up
  }
  if (!ws) await Bun.sleep(500);
}
console.log(" ready");

// Open Chrome DevTools inspector for main webview
const url = `devtools://devtools/bundled/inspector.html?ws=${ws}`;
await $`osascript -e ${`tell application "Google Chrome" to open location "${url}"`}`;
