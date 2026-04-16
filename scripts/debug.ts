/**
 * Launch Anki with remote debugging and auto-open Chrome DevTools
 * for the main webview. Requires macOS and Google Chrome.
 */
import { $ } from "bun";
import os from "os";
import process from "process";

// Default port on Linux is set to 9222 because this is what
// chrome://inspect/#devices scans for by default on localhost.
const PORT = Number(process.argv[2]) || (os.platform() === "linux" ? 9222 : 9230);

// Get the addon path for the current platform.
function addon(): string {
  switch (os.platform()) {
    case "linux":
      return `${process.env.HOME}/.local/share/Anki2/addons21/anki_markdown`;
    case "darwin":
      return `${process.env.HOME}/Library/Application/Support/Anki2/addons21/anki_markdown`;
    default:
      throw new Error(`Anki addon path undefined for ${os.platform()}.`)
  }
}

// Ensure that Anki is stopped.
//
// This is because environment variables are only applied
// on fresh launch.
async function ensureAnkiStopped(): Promise<void> {
  switch (os.platform()) {
    case "darwin": {
      const running = await $`pgrep -f Anki.app/Contents/MacOS`.quiet().nothrow();
      if (running.exitCode === 0) {
        console.log("Quitting Anki...");
        await $`osascript -e 'tell application "Anki" to quit'`;
        while ((await $`pgrep -f Anki.app/Contents/MacOS`.quiet().nothrow()).exitCode === 0)
          await Bun.sleep(500);
      }
      break;
    }
    case "linux":
      // I am not 100% sure that this is a clean way to kill Anki.
      // Remember to always make backups :)
      try {
        await $`pkill -f 'python.*anki$'`
        await Bun.sleep(1000);
      } catch (err) {
        console.warn(`Couldn't kill Anki. Perhaps it was not running in the first place? Error: ${err}`);
      }
      break
    default:
      throw new Error(`Anki killing not supported on platform = ${os.platform()}`);
  }
}

async function launchAnki(): Promise<{frontend: string, anki: Subprocess}> {
  let bin: string;
  switch (os.platform()) {
    case "darwin":
      // Launch Anki with remote debugging (invoke binary directly; `open -a` strips env vars)
      bin = "/Applications/Anki.app/Contents/MacOS/launcher";
      break;
    case "linux": {
      // Dynamically get Anki's path.
      let resp = await $`which anki`;
      if (resp.exitCode !== 0) {
        throw new Error(`'which anki' failed with exit code ${resp.exitCode}`)
      }
      bin = resp.stdout.toString().trim();
      break
    }
    default:
      throw new Error(`Anki launching not supported on platform = ${os.platform()}`);
  }

  const anki = Bun.spawn([bin], {
    env: { ...process.env, QTWEBENGINE_REMOTE_DEBUGGING: String(PORT) },
  });

  process.on("SIGINT", () => {
    anki.kill();
    process.exit();
  });

  // Wait for main webview target
  process.stdout.write("Waiting for Anki...");
  let frontend: string | undefined;
  const deadline = Date.now() + 30_000;
  while (!frontend) {
    if (Date.now() > deadline) {
      console.error("\nTimed out waiting for Anki main webview");
      process.exit(1);
    }
    try {
      const targets: any[] = await fetch(`http://localhost:${PORT}/json`).then(
        (r) => r.json(),
      );
      const main = targets.find((t) => t.title === "main webview");
      if (main) frontend = main.devtoolsFrontendUrl;
    } catch (err) {
      console.warn(`error while trying to fetch DevTools' /json: ${err}`);
    }
    if (!frontend) await Bun.sleep(500);
  }

  return {frontend, anki};
}

// Launch the DevTools window.
//
// Contributions to make this automated on Linux are
// welcome!
async function launchDevtools(url: string): Promise<void> {
  switch (os.platform()) {
    case "linux":
      console.warn("Opening DevTools automatically is not supported on Linux. Open Chromium and navigate to chrome://inspect/#devices to open.")
      break
    case "darwin":
      await $`osascript -e ${`tell application "Google Chrome" to open location "${url}"`}`;
      break;
    default:
      throw new Error(`DevTools launching not supported on ${os.platform()}`);
  }
}

await ensureAnkiStopped();

// Symlink add-on
await $`ln -sfn ${process.cwd()}/anki_markdown ${addon()}`;

const {frontend, anki} = await launchAnki();

console.log(" ready");

// Open Qt WebEngine's own DevTools frontend (avoids Chrome protocol mismatch)
const url = `http://localhost:${PORT}${frontend}`;
await launchDevtools(url)

await anki.exited;
