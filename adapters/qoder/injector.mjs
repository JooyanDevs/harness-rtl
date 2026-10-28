/*
 * Qoder Desktop RTL injector.
 *
 * Qoder has no user-CSS or UI-extension surface (its skills/MCP/plugins cannot
 * touch the workbench renderer), and the app.asar is fuse-protected, so the fix
 * is injected at runtime over the Chrome DevTools Protocol. The app must be
 * started with --remote-debugging-port=<port>; start-qoder-rtl.vbs does that.
 *
 * For every page target the injector:
 *   1. installs rtl-fix.page.js for future navigations (addScriptToEvaluate...),
 *   2. runs it once in the current document,
 *   3. keeps polling so a restarted/reloaded renderer is fixed again.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PAGE_SOURCE = fs.readFileSync(path.join(__dirname, 'rtl-fix.page.js'), 'utf8');
const PORT = Number(process.env.QODER_RTL_PORT || 9227);
const POLL_MS = Number(process.env.QODER_RTL_POLL_MS || 2000);
const LOG_PATH = path.join(__dirname, 'injector.log');
const LOCK_PATH = path.join(__dirname, 'injector.lock');
const CHECK_EXPR = "!!(window.__qoderHarnessRtl && document.getElementById('harness-rtl-style'))";

function log(msg) {
  const line = `[${new Date().toISOString()}] ${msg}\n`;
  try {
    if (fs.existsSync(LOG_PATH) && fs.statSync(LOG_PATH).size > 512 * 1024) {
      fs.writeFileSync(LOG_PATH, '');
    }
    fs.appendFileSync(LOG_PATH, line);
  } catch {}
}

/* ---- single instance -------------------------------------------------- */
try {
  if (fs.existsSync(LOCK_PATH)) {
    const pid = Number(fs.readFileSync(LOCK_PATH, 'utf8').trim());
    if (pid && pid !== process.pid) {
      try {
        process.kill(pid, 0); // alive → another injector is already running
        process.exit(0);
      } catch {}
    }
  }
  fs.writeFileSync(LOCK_PATH, String(process.pid));
  process.on('exit', () => {
    try { if (fs.readFileSync(LOCK_PATH, 'utf8').trim() === String(process.pid)) fs.unlinkSync(LOCK_PATH); } catch {}
  });
} catch (e) {
  log('lock setup failed: ' + e.message);
}

/* ---- minimal CDP client ----------------------------------------------- */
class Cdp {
  constructor(url) {
    this.url = url;
    this.ws = null;
    this.nextId = 1;
    this.waiters = new Map();
    this.closed = false;
  }

  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      const timeout = setTimeout(() => reject(new Error('ws open timeout')), 5000);
      ws.onopen = () => {
        clearTimeout(timeout);
        resolve();
      };
      ws.onerror = () => {
        clearTimeout(timeout);
        reject(new Error('ws error'));
      };
      ws.onmessage = (event) => {
        let msg;
        try { msg = JSON.parse(event.data); } catch { return; }
        if (!msg.id) return;
        const waiter = this.waiters.get(msg.id);
        if (!waiter) return;
        this.waiters.delete(msg.id);
        if (msg.error) waiter.reject(new Error(msg.error.message || 'cdp error'));
        else waiter.resolve(msg.result);
      };
      ws.onclose = () => {
        this.closed = true;
        for (const waiter of this.waiters.values()) waiter.reject(new Error('ws closed'));
        this.waiters.clear();
      };
    });
  }

  send(method, params = {}) {
    if (this.closed || !this.ws || this.ws.readyState !== 1) {
      return Promise.reject(new Error('ws not open'));
    }
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => {
        if (this.waiters.has(id)) {
          this.waiters.delete(id);
          reject(new Error(method + ' timeout'));
        }
      }, 5000);
    });
  }

  close() {
    try { this.ws && this.ws.close(); } catch {}
  }
}

/* ---- injection loop ---------------------------------------------------- */
const sessions = new Map(); // targetId -> { cdp, url }
let lastState = '';

async function listPages() {
  const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, {
    signal: AbortSignal.timeout(2500),
  });
  if (!res.ok) throw new Error('list http ' + res.status);
  const targets = await res.json();
  return targets.filter(
    (t) =>
      t.type === 'page' &&
      t.webSocketDebuggerUrl &&
      String(t.url).trim() !== '' &&
      !String(t.url).startsWith('devtools://') &&
      !String(t.url).startsWith('chrome') &&
      !String(t.url).startsWith('about:')
  );
}

async function attach(target) {
  const cdp = new Cdp(target.webSocketDebuggerUrl);
  await cdp.open();
  await cdp.send('Page.enable');
  try {
    await cdp.send('Page.addScriptToEvaluateOnNewDocument', { source: PAGE_SOURCE });
  } catch (e) {
    log(`addScript failed for ${target.url}: ${e.message}`);
  }
  const result = await cdp.send('Runtime.evaluate', {
    expression: CHECK_EXPR,
    returnByValue: true,
  });
  const already = result && result.result && result.result.value;
  if (!already) {
    await cdp.send('Runtime.evaluate', { expression: PAGE_SOURCE, awaitPromise: false });
    log(`injected → ${target.url}`);
  }
  sessions.set(target.id, { cdp, url: target.url });
}

async function poll() {
  let targets;
  try {
    targets = await listPages();
  } catch (e) {
    const state = 'waiting for Qoder CDP port';
    if (state !== lastState) { log(state); lastState = state; }
    return;
  }

  const seen = new Set();
  for (const target of targets) {
    seen.add(target.id);
    if (sessions.has(target.id)) continue;
    try {
      await attach(target);
    } catch (e) {
      log(`attach failed ${target.url}: ${e.message}`);
    }
  }

  // Drop sessions for targets that no longer exist or whose socket died.
  for (const [id, session] of sessions) {
    if (!seen.has(id) || session.cdp.closed) {
      session.cdp.close();
      sessions.delete(id);
    }
  }

  const state = `connected: ${sessions.size} page(s)`;
  if (state !== lastState) { log(state); lastState = state; }
}

log(`injector started (port ${PORT}, pid ${process.pid})`);
setInterval(poll, POLL_MS);
poll();

process.on('SIGTERM', () => process.exit(0));
process.on('SIGINT', () => process.exit(0));
