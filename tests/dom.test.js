'use strict';
/*
 * Headless-Chromium check of the real renderer script: direction, alignment,
 * code islands, tables, composer, font. Skipped when no browser is installed.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn } = require('node:child_process');
const { pathToFileURL } = require('node:url');

const ROOT = path.join(__dirname, '..');
const SOURCE = ['engine/direction.js', 'engine/dom-fix.js']
  .map((f) => fs.readFileSync(path.join(ROOT, f), 'utf8'))
  .join('\n') + '\nglobalThis.__harnessRtl = HarnessRtlDom.install({ font: true, composer: true });\n';
const PAGE_URL = pathToFileURL(path.join(__dirname, 'fixtures', 'dom.html')).href;
const PORT = 9334;
const PROFILE = path.join(os.tmpdir(), 'harness-rtl-chrome-' + Date.now());

const CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean);
const BROWSER = CANDIDATES.find((p) => fs.existsSync(p));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

class Cdp {
  constructor(url) { this.url = url; this.nextId = 1; this.waiters = new Map(); }
  open() {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(this.url);
      this.ws = ws;
      ws.onopen = resolve;
      ws.onerror = () => reject(new Error('ws error'));
      ws.onmessage = (event) => {
        const msg = JSON.parse(event.data);
        const waiter = this.waiters.get(msg.id);
        if (!waiter) return;
        this.waiters.delete(msg.id);
        msg.error ? waiter.reject(new Error(msg.error.message)) : waiter.resolve(msg.result);
      };
    });
  }
  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.waiters.set(id, { resolve, reject });
      this.ws.send(JSON.stringify({ id, method, params }));
      setTimeout(() => { if (this.waiters.delete(id)) reject(new Error(method + ' timeout')); }, 5000);
    });
  }
  close() { try { this.ws.close(); } catch {} }
}

async function pageTarget() {
  for (let i = 0; i < 40; i++) {
    try {
      const res = await fetch(`http://127.0.0.1:${PORT}/json/list`, { signal: AbortSignal.timeout(1000) });
      const page = (await res.json()).find((t) => t.type === 'page' && t.url.startsWith('file:'));
      if (page) return page;
    } catch {}
    await sleep(250);
  }
  throw new Error('no page target');
}

const VERIFY = `(() => {
  const read = (id) => {
    const el = document.getElementById(id);
    const cs = getComputedStyle(el);
    return {
      attr: el.getAttribute('data-harness-rtl'),
      dirAttr: el.getAttribute('dir'),
      direction: cs.direction,
      textAlign: cs.textAlign,
      unicodeBidi: cs.unicodeBidi,
      fontFamily: cs.fontFamily,
    };
  };
  const out = {};
  for (const id of ['fa','en','mixed','en-one-fa','sidebar','code-parent','cell-fa','cell-en','editor','ta','preblock']) out[id] = read(id);
  out.code = read.call(null, 'code-parent');
  const code = document.querySelector('#code-parent code');
  out.codeChild = { direction: getComputedStyle(code).direction, unicodeBidi: getComputedStyle(code).unicodeBidi };
  out.stylePresent = !!document.getElementById('harness-rtl-style');
  out.count = window.__harnessRtl ? window.__harnessRtl.count() : -1;
  return JSON.stringify(out);
})()`;

test('renderer fixes direction, alignment, code islands and composer', { skip: !BROWSER }, async () => {
  const child = spawn(BROWSER, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${PROFILE}`,
    '--no-first-run',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=900,1100',
    PAGE_URL,
  ], { stdio: 'ignore' });

  let cdp;
  try {
    const target = await pageTarget();
    cdp = new Cdp(target.webSocketDebuggerUrl);
    await cdp.open();
    await cdp.send('Page.enable');
    await cdp.send('Runtime.evaluate', { expression: SOURCE });
    await sleep(500);
    const res = await cdp.send('Runtime.evaluate', { expression: VERIFY, returnByValue: true });
    const d = JSON.parse(res.result.value);

    assert.ok(d.stylePresent, 'style element present');
    assert.ok(d.count > 0, 'sweep marked at least one element');

    assert.equal(d.fa.direction, 'rtl', 'Persian paragraph direction');
    assert.equal(d.fa.textAlign, 'start', 'Persian paragraph alignment');
    assert.equal(d.fa.unicodeBidi, 'isolate', 'Persian paragraph isolate');
    assert.match(d.fa.fontFamily, /Vazirmatn/, 'Persian paragraph font');

    assert.equal(d.en.attr, null, 'English paragraph not marked');
    assert.equal(d.en.direction, 'ltr', 'English paragraph stays ltr');

    assert.equal(d.mixed.direction, 'rtl', 'mixed text is rtl');
    assert.equal(d['en-one-fa'].direction, 'rtl', 'one Persian word flips an English sentence');

    assert.equal(d.sidebar.direction, 'rtl', 'truncating wrapper inherits direction');
    assert.equal(d['code-parent'].direction, 'rtl', 'paragraph with inline code is rtl');
    assert.equal(d.codeChild.direction, 'ltr', 'inline code pinned ltr');
    assert.equal(d.codeChild.unicodeBidi, 'isolate', 'inline code isolated');

    assert.equal(d['cell-fa'].direction, 'rtl', 'Persian cell rtl');
    assert.equal(d['cell-fa'].unicodeBidi, 'plaintext', 'Persian cell plaintext');
    assert.equal(d['cell-en'].attr, null, 'English cell untouched');

    assert.equal(d.editor.dirAttr, 'auto', 'composer gets dir=auto');
    assert.equal(d.editor.attr, null, 'composer not marked');
    assert.equal(d.ta.dirAttr, 'auto', 'textarea gets dir=auto');

    assert.equal(d.preblock.attr, null, 'pre block untouched');
  } finally {
    if (cdp) cdp.close();
    child.kill();
    await sleep(300);
    try { fs.rmSync(PROFILE, { recursive: true, force: true }); } catch {}
  }
});
