/**
 * Launch Anki with remote debugging and auto-open Chrome DevTools
 * for the main webview. Requires macOS and Google Chrome.
 * Tested with Anki 25.09.2.
 */
import { $ } from "bun";

const addon = `${process.env.HOME}/Library/Application Support/Anki2/addons21/anki_markdown`;
const port = 9222;

// Symlink add-on
await $`ln -sfn ${process.cwd()}/anki_markdown ${addon}`;

// Launch Anki with remote debugging
await $`QTWEBENGINE_REMOTE_DEBUGGING=${port} open -a Anki`;

// Wait for main webview target
process.stdout.write("Waiting for Anki...");
let ws: string | undefined;
while (!ws) {
  try {
    const targets: any[] = await fetch(`http://localhost:${port}/json`).then(
      (r) => r.json(),
    );
    const main = targets.find((t) => t.title === "main webview");
    if (main) ws = main.webSocketDebuggerUrl.replace("ws://", "");
  } catch (_) {
    // Connection refused while Anki is starting up
  }
  if (!ws) await Bun.sleep(500);
}
console.log(" ready");

// Open Chrome DevTools inspector for main webview
const url = `devtools://devtools/bundled/inspector.html?ws=${ws}`;
await $`osascript -e ${`tell application "Google Chrome" to open location "${url}"`}`;
