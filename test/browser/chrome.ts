import { spawn, type ChildProcess } from "node:child_process";
import { access, mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

type Message = { id?: number; result?: unknown; error?: { message: string }; method?: string; sessionId?: string };

class Connection {
  private socket: WebSocket;
  private sequence = 0;
  private pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>();
  private events = new Map<string, () => void>();

  constructor(socket: WebSocket) {
    this.socket = socket;
    socket.addEventListener("message", event => {
      const message = JSON.parse(String(event.data)) as Message;
      if (message.id) {
        const pending = this.pending.get(message.id);
        this.pending.delete(message.id);
        if (message.error) pending?.reject(new Error(message.error.message));
        else pending?.resolve(message.result);
      } else if (message.method) {
        const key = `${message.sessionId ?? ""}:${message.method}`;
        this.events.get(key)?.();
        this.events.delete(key);
      }
    });
    socket.addEventListener("close", () => {
      for (const item of this.pending.values()) item.reject(new Error("Test browser closed."));
      this.pending.clear();
    });
  }

  async send<T = unknown>(method: string, params: Record<string, unknown> = {}, sessionId?: string): Promise<T> {
    if (this.socket.readyState !== WebSocket.OPEN) {
      throw new Error("Test browser is unavailable; check that the environment permits launching Chrome.");
    }
    const id = ++this.sequence;
    return new Promise<T>((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pending.delete(id);
        reject(new Error(`Browser command timed out: ${method}`));
      }, 15_000);
      this.pending.set(id, {
        resolve: value => { clearTimeout(timeout); resolve(value as T); },
        reject: error => { clearTimeout(timeout); reject(error); }
      });
      this.socket.send(JSON.stringify({ id, method, params, sessionId }));
    });
  }

  loaded(sessionId: string): Promise<void> {
    const key = `${sessionId}:Page.loadEventFired`;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.events.delete(key);
        reject(new Error("Browser page did not finish loading."));
      }, 15_000);
      this.events.set(key, () => { clearTimeout(timeout); resolve(); });
    });
  }
}

export class TestPage {
  private connection: Connection;
  private targetId: string;
  private sessionId: string;

  constructor(connection: Connection, targetId: string, sessionId: string) {
    this.connection = connection;
    this.targetId = targetId;
    this.sessionId = sessionId;
  }

  async viewport(width: number, height = 900) {
    await this.connection.send("Emulation.setDeviceMetricsOverride", {
      width, height, deviceScaleFactor: 1, mobile: false
    }, this.sessionId);
  }

  async navigate(url: string, scripts = true) {
    await this.connection.send("Emulation.setScriptExecutionDisabled", { value: !scripts }, this.sessionId);
    const loaded = this.connection.loaded(this.sessionId);
    await this.connection.send("Page.navigate", { url }, this.sessionId);
    await loaded;
  }

  async evaluate<T>(expression: string): Promise<T> {
    const response = await this.connection.send<{
      result: { value: T }; exceptionDetails?: unknown;
    }>("Runtime.evaluate", { expression, returnByValue: true, awaitPromise: true }, this.sessionId);
    if (response.exceptionDetails) throw new Error("Browser assertion script failed: " + JSON.stringify(response.exceptionDetails));
    return response.result.value;
  }

  async key(key: "Enter" | "Tab" | "Escape") {
    const code = { Enter: 13, Tab: 9, Escape: 27 }[key];
    await this.connection.send("Input.dispatchKeyEvent", {
      type: "keyDown", key, code: key, windowsVirtualKeyCode: code,
      ...(key === "Enter" ? { text: "\r" } : {})
    }, this.sessionId);
    await this.connection.send("Input.dispatchKeyEvent", {
      type: "keyUp", key, code: key, windowsVirtualKeyCode: code
    }, this.sessionId);
  }

  async close() { await this.connection.send("Target.closeTarget", { targetId: this.targetId }); }
}

export async function launchChrome() {
  const candidates = process.env.CHROME_PATH ? [process.env.CHROME_PATH] : [
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/usr/bin/google-chrome", "/usr/bin/chromium", "/usr/bin/chromium-browser"
  ];
  let executable: string | undefined;
  for (const candidate of candidates) {
    try { await access(candidate); executable = candidate; break; } catch { /* Try the next browser. */ }
  }
  if (!executable) throw new Error("Browser tests require installed Chrome/Chromium or CHROME_PATH.");

  const temporaryRoot = path.resolve(tmpdir());
  const profile = await mkdtemp(path.join(temporaryRoot, "xojazzle-browser-test-"));
  let processHandle: ChildProcess | undefined;
  let connection: Connection | undefined;
  let exited: Promise<void> | undefined;
  let finished = false;
  let processStatus = "still running";
  let stderr = "";
  let endpoint = "";

  function localBrowserEndpoint(value: string): string {
    try {
      const url = new URL(value);
      if (
        url.protocol === "ws:" &&
        url.hostname === "127.0.0.1" &&
        url.port !== "" &&
        url.username === "" &&
        url.password === "" &&
        url.search === "" &&
        url.hash === "" &&
        /^\/devtools\/browser\/[a-zA-Z0-9-]+$/.test(url.pathname)
      ) {
        return url.href;
      }
    } catch {
      // Ignore incomplete or invalid endpoint data.
    }
    return "";
  }

  function startupError(message: string): Error {
    return new Error(
      message +
      "\nExecutable: " + executable +
      "\nProcess status: " + processStatus +
      "\nChrome stderr (last 8192 characters):\n" +
      (stderr.trim() || "(none captured)")
    );
  }

  async function close() {
    try {
      await connection?.send("Browser.close").catch(() => {});
      if (processHandle) {
        const timeout = setTimeout(() => processHandle?.kill("SIGKILL"), 5_000);
        try { await exited; } finally { clearTimeout(timeout); }
      }
    } finally {
      if (path.dirname(profile) !== temporaryRoot || !path.basename(profile).startsWith("xojazzle-browser-test-")) {
        throw new Error("Refusing cleanup outside the browser test temporary directory.");
      }
      await rm(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
    }
  }

  try {
    processHandle = spawn(executable, [
      "--headless=new", "--no-first-run", "--no-default-browser-check",
      "--remote-debugging-address=127.0.0.1", "--remote-debugging-port=0",
      "--user-data-dir=" + profile, "about:blank"
    ], { windowsHide: true, stdio: ["ignore", "ignore", "pipe"] });

    processHandle.stderr?.setEncoding("utf8");
    processHandle.stderr?.on("data", (chunk: string) => {
      stderr = (stderr + chunk).slice(-8192);
      const match = stderr.match(/DevTools listening on (ws:\/\/\S+)\r?\n/);
      if (!endpoint && match) {
        endpoint = localBrowserEndpoint(match[1]);
      }
    });

    exited = new Promise<void>(resolve => {
      processHandle!.once("error", (error: Error) => {
        processStatus = "launch error: " + error.message;
      });
      processHandle!.once("close", (code, signal) => {
        finished = true;
        if (!processStatus.startsWith("launch error:")) {
          processStatus = "exit code " + String(code) +
            ", signal " + String(signal);
        }
        resolve();
      });
    });

    const startupDeadline = Date.now() + 30_000;
    while (!endpoint && !finished && Date.now() < startupDeadline) {
      try {
        const [port, route] = (await readFile(path.join(profile, "DevToolsActivePort"), "utf8"))
          .trim().split("\n").map(line => line.trim());
        if (!endpoint && port && route) {
          endpoint = localBrowserEndpoint("ws://127.0.0.1:" + port + route);
        }
      } catch {
        // The endpoint can also arrive through Chrome's stderr.
      }
      if (!endpoint && !finished) {
        await new Promise(resolve => setTimeout(resolve, 100));
      }
    }

    if (finished) {
      throw startupError("Chrome exited during startup.");
    }
    if (!endpoint) {
      throw startupError("Chrome did not expose its debugging endpoint within 30 seconds.");
    }

    const socket = new WebSocket(endpoint);
    await new Promise<void>((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(startupError("Chrome debugger connection timed out."));
      }, 15_000);
      socket.addEventListener("open", () => {
        clearTimeout(timeout);
        resolve();
      }, { once: true });
      socket.addEventListener("error", () => {
        clearTimeout(timeout);
        reject(startupError("Could not connect to test browser."));
      }, { once: true });
      socket.addEventListener("close", () => {
        clearTimeout(timeout);
        reject(startupError("Chrome debugger closed during connection."));
      }, { once: true });
    });
    connection = new Connection(socket);
    return {
      close,
      async page(width: number) {
        const { targetId } = await connection!.send<{ targetId: string }>("Target.createTarget", { url: "about:blank" });
        const { sessionId } = await connection!.send<{ sessionId: string }>("Target.attachToTarget", { targetId, flatten: true });
        await connection!.send("Page.enable", {}, sessionId);
        const page = new TestPage(connection!, targetId, sessionId);
        await page.viewport(width);
        return page;
      }
    };
  } catch (error) { await close(); throw error; }
}