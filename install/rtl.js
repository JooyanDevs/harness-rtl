#!/usr/bin/env node
/*
 * harness-rtl installer / verifier / update checker.
 *
 *   node install/rtl.js detect [--json]
 *   node install/rtl.js install [claude|qoder|hermes|codex]... [--dry-run] [--no-rules]
 *   node install/rtl.js verify [id]...
 *   node install/rtl.js check [--hook]
 *   node install/rtl.js uninstall [id]...
 *   node install/rtl.js build
 *
 * Local only: reads versions and config paths, never message content, never
 * sends anything over the network. Every harness is fixed through its own
 * native extension point; nothing is installed outside the harness folders.
 */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const ROOT = path.join(__dirname, '..');
const pkg = require(path.join(ROOT, 'package.json'));
const manifest = require(path.join(ROOT, 'install', 'harnesses.json'));
const HOME = os.homedir();
const STATE_DIR = path.join(HOME, '.harness-rtl');
const STATE_FILE = path.join(STATE_DIR, 'state.json');

const argv = process.argv.slice(2);
const cmd = (argv[0] || 'help').toLowerCase();
const flags = argv.filter((a) => a.startsWith('--'));
const targets = argv.slice(1).filter((a) => !a.startsWith('--'));
const has = (f) => flags.includes(f);

function rulesBlock(withCheck) {
  const check = withCheck
    ? `\n- At the start of a session, run \`node "${norm(path.join(ROOT, 'install', 'rtl.js'))}" check --hook\`. If it prints a \`harness-rtl:\` line, repeat it to the user in one line; the harness changed and the skill may need updating.`
    : '';
  return `<!-- harness-rtl:begin (managed; edit outside this block) -->
## Persian output

- When the user writes Persian, reply in Persian.
- A block that contains Persian is right-to-left. Keep a Persian paragraph on one line and never break it with a command, path, URL or identifier — put those on their own line.
- Pure English and code stay left-to-right. Mixed Persian + English is right-to-left.
- Fenced code must stay byte-exact: no bidi control characters, no reordering, no wrapping.
- Persian prose the user will copy (a script, caption, message) goes in a fence tagged "fa"; the display hook shows it right-aligned. Never tag a command or path "fa". When you can run commands, also put that exact text on the clipboard (the "fa" block has no copy button): write it to a UTF-8 file, then on Windows run powershell -NoProfile -Command "Get-Content -Raw -Encoding UTF8 <file> | Set-Clipboard" (macOS: pbcopy < file), and say it was copied.${check}
<!-- harness-rtl:end -->`;
}

/* ---------------------------------------------------------------- helpers */

const exists = (p) => { try { return fs.existsSync(p); } catch { return false; } };
const read = (p) => fs.readFileSync(p, 'utf8');
const readJson = (p) => JSON.parse(read(p));
const write = (p, text) => fs.writeFileSync(p, text);
const writeJson = (p, value) => write(p, JSON.stringify(value, null, 2) + '\n');
const norm = (p) => p.replace(/\\/g, '/');

function backup(file) {
  if (!exists(file)) return;
  fs.copyFileSync(file, file + '.harness-rtl.bak');
}

function localAppData() {
  return process.env.LOCALAPPDATA || path.join(HOME, 'AppData', 'Local');
}

function firstVersion(text) {
  const m = String(text).match(/\d+\.\d+\.\d+/);
  return m ? m[0] : null;
}

function versionOf(bin, args) {
  for (const name of [bin, bin + '.exe', bin + '.cmd']) {
    try {
      return firstVersion(execFileSync(name, args, {
        encoding: 'utf8',
        timeout: 8000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }));
    } catch {}
  }
  return null;
}

function cmpVersion(a, b) {
  const pa = String(a).split('.').map(Number);
  const pb = String(b).split('.').map(Number);
  for (let i = 0; i < 3; i++) {
    if ((pa[i] || 0) !== (pb[i] || 0)) return (pa[i] || 0) - (pb[i] || 0);
  }
  return 0;
}

function loadState() {
  if (!exists(STATE_FILE)) return { schema: 1, repo: ROOT, version: pkg.version, verified: {}, installedSkills: {} };
  try {
    const s = readJson(STATE_FILE);
    s.verified = s.verified || {};
    s.installedSkills = s.installedSkills || {};
    s.repo = ROOT;
    return s;
  } catch {
    return { schema: 1, repo: ROOT, version: pkg.version, verified: {}, installedSkills: {} };
  }
}

function saveState(state) {
  fs.mkdirSync(STATE_DIR, { recursive: true });
  writeJson(STATE_FILE, state);
}

function copyFile(src, dest) {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  fs.copyFileSync(src, dest);
}

function copyDir(src, dest) {
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const from = path.join(src, entry.name);
    const to = path.join(dest, entry.name);
    if (entry.isDirectory()) copyDir(from, to);
    else fs.copyFileSync(from, to);
  }
}

/* --------------------------------------------------------------- detection */

function detectClaude() {
  const dir = path.join(HOME, '.claude');
  if (!exists(dir)) return null;
  const settings = path.join(dir, 'settings.json');
  const adapterFile = path.join(dir, 'hooks', 'harness-rtl', 'fix-rtl.js');
  return {
    id: 'claude',
    name: 'Claude Code',
    version: versionOf('claude', ['--version']),
    adapterInstalled: exists(adapterFile) && settingsHas(settings),
    legacy: settingsHasLegacy(settings),
    adapterFile,
    settings,
    rulesFile: path.join(dir, 'CLAUDE.md'),
    skillsDir: path.join(dir, 'skills'),
  };
}

function hooksCommands(file) {
  if (!exists(file)) return [];
  try {
    const s = readJson(file);
    const out = [];
    for (const groups of Object.values(s.hooks || {})) {
      for (const group of groups) for (const hook of group.hooks || []) out.push(String(hook.command || ''));
    }
    return out;
  } catch {
    return [];
  }
}

function settingsHas(file) {
  return hooksCommands(file).some((c) => c.includes('harness-rtl'));
}

function settingsHasLegacy(file) {
  return hooksCommands(file).some((c) => c.includes('farsi-rtl'));
}

function removeLegacyHooks(file) {
  if (!exists(file)) return;
  const settings = readJson(file);
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes('farsi-rtl')) }))
      .filter((g) => g.hooks.length > 0);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  backup(file);
  writeJson(file, settings);
}

function qoderRoot() {
  const cands = [];
  if (process.env.QODER_ROOT) cands.push(process.env.QODER_ROOT);
  const ini = path.join(localAppData(), 'Qoder', 'Qoder Launcher', 'state.ini');
  if (exists(ini)) {
    const m = read(ini).match(/^\s*installDir\s*=\s*(.+?)\s*$/m);
    if (m) cands.push(m[1]);
  }
  const pf = process.env.ProgramFiles;
  const pf86 = process.env['ProgramFiles(x86)'];
  if (pf) cands.push(path.join(pf, 'Qoder'));
  if (pf86) cands.push(path.join(pf86, 'Qoder'));
  cands.push(path.join(localAppData(), 'Programs', 'Qoder'));
  return cands.find((p) => p && exists(p)) || null;
}

function qoderVersion(root) {
  if (!root) return null;
  const vr = path.join(root, '.qoder-versions');
  if (exists(vr)) {
    const vs = fs.readdirSync(vr).filter((n) => exists(path.join(vr, n, 'Qoder.exe')));
    vs.sort(cmpVersion);
    if (vs.length) return vs[vs.length - 1];
  }
  return versionOf(path.join(root, 'Qoder.exe'), ['--version']);
}

function detectQoder() {
  const root = qoderRoot();
  if (!root) return null;
  const dir = path.join(HOME, '.qoder');
  const settings = path.join(dir, 'settings.json');
  const skillsDir = path.join(dir, 'skills');
  const hookFile = path.join(skillsDir, 'harness-rtl', 'qoder', 'hook.js');
  return {
    id: 'qoder',
    name: 'Qoder',
    root,
    version: qoderVersion(root),
    adapterInstalled: exists(hookFile) && settingsHas(settings),
    settings,
    hookFile,
    skillsDir,
    legacyDir: path.join(dir, 'harness-rtl'),
    legacy: exists(path.join(dir, 'harness-rtl')),
  };
}

/* Harnesses without a display hook live on their global instruction file. */

function detectCline() {
  const isInstalled = exists(path.join(HOME, '.cline')) || exists(path.join(localAppData(), 'Cline'));
  if (!isInstalled) return null;
  const docs = exists(path.join(HOME, 'OneDrive', 'Documents'))
    ? path.join(HOME, 'OneDrive', 'Documents')
    : path.join(HOME, 'Documents');
  const rulesDir = path.join(docs, 'Cline', 'Rules');
  const rulesFile = path.join(rulesDir, 'harness-rtl.md');
  return {
    id: 'cline',
    name: 'Cline',
    version: versionOf('cline-app', ['--version']),
    rulesFile,
    adapterInstalled: exists(rulesFile) && read(rulesFile).includes('harness-rtl:begin'),
  };
}

function detectOpencode() {
  const dir = path.join(HOME, '.config', 'opencode');
  if (!exists(dir)) return null;
  const skillsDir = path.join(dir, 'skills');
  return {
    id: 'opencode',
    name: 'OpenCode',
    version: versionOf('opencode', ['--version']),
    rulesFile: path.join(dir, 'AGENTS.md'),
    skillsDir,
    adapterInstalled:
      exists(path.join(dir, 'AGENTS.md')) &&
      read(path.join(dir, 'AGENTS.md')).includes('harness-rtl:begin'),
  };
}

function detectZcode() {
  const dir = path.join(HOME, '.zcode');
  if (!exists(dir)) return null;
  return {
    id: 'zcode',
    name: 'ZCode',
    version: versionOf('ZCode', ['--version']),
    rulesFile: path.join(dir, 'AGENTS.md'),
    skillsDir: path.join(dir, 'skills'),
    adapterInstalled:
      exists(path.join(dir, 'AGENTS.md')) &&
      read(path.join(dir, 'AGENTS.md')).includes('harness-rtl:begin'),
  };
}

function detectFreebuff() {
  const data = path.join(process.env.APPDATA || '', 'Freebuff');
  const app = path.join(localAppData(), 'Programs', '@codebufffreebuff-desktop');
  if (!exists(data) && !exists(app)) return null;
  const rulesFile = path.join(HOME, '.knowledge.md');
  return {
    id: 'freebuff',
    name: 'Freebuff',
    version: null,
    rulesFile,
    adapterInstalled: exists(rulesFile) && read(rulesFile).includes('harness-rtl:begin'),
  };
}

function detectDeepseek() {
  const dir = path.join(HOME, '.dsh');
  if (!exists(dir)) return null;
  return {
    id: 'deepseek',
    name: 'DeepSeek Harness',
    version: null,
    rulesFile: path.join(dir, 'AGENTS.md'),
    skillsDir: path.join(dir, 'skills'),
    adapterInstalled:
      exists(path.join(dir, 'AGENTS.md')) &&
      read(path.join(dir, 'AGENTS.md')).includes('harness-rtl:begin'),
  };
}

function hermesProfiles() {
  for (const root of [path.join(localAppData(), 'hermes', 'profiles'), path.join(HOME, '.hermes', 'profiles')]) {
    if (!exists(root)) continue;
    const profiles = fs.readdirSync(root, { withFileTypes: true })
      .filter((e) => e.isDirectory() && exists(path.join(root, e.name, 'config.yaml')))
      .map((e) => path.join(root, e.name));
    if (profiles.length) return profiles;
  }
  return [];
}

function detectHermes() {
  const profiles = hermesProfiles();
  const skillsRoot = path.join(HOME, '.hermes', 'skills');
  if (!profiles.length && !exists(skillsRoot)) return null;
  return {
    id: 'hermes',
    name: 'Hermes',
    profiles,
    version: versionOf('hermes', ['--version']),
    adapterInstalled: profiles.some((p) => exists(path.join(p, 'plugins', 'harness-rtl', 'desktop', 'plugin.js'))),
    skillsDir: skillsRoot,
  };
}

function detectCodex() {
  const dir = path.join(HOME, '.codex');
  if (!exists(dir)) return null;
  const rulesFile = path.join(dir, 'AGENTS.md');
  return {
    id: 'codex',
    name: 'Codex',
    version: versionOf('codex', ['--version']),
    adapterInstalled: exists(rulesFile) && read(rulesFile).includes('harness-rtl:begin'),
    adapterFile: rulesFile,
    rulesFile,
    skillsDir: path.join(dir, 'skills'),
  };
}

function detectAll() {
  return [
    detectClaude(), detectQoder(), detectHermes(), detectCodex(),
    detectCline(), detectOpencode(), detectZcode(), detectFreebuff(), detectDeepseek(),
  ].filter(Boolean);
}

/* ------------------------------------------------------------- file edits */

function upsertHookGroup(file, event, command, timeout) {
  const settings = exists(file) ? readJson(file) : {};
  settings.hooks = settings.hooks || {};
  const groups = settings.hooks[event] || [];
  for (const group of groups) {
    group.hooks = (group.hooks || []).filter((h) => !String(h.command || '').includes('harness-rtl'));
  }
  settings.hooks[event] = groups.filter((g) => g.hooks.length > 0);
  settings.hooks[event].push({ hooks: [{ type: 'command', command, timeout }] });
  backup(file);
  writeJson(file, settings);
}

function removeHooks(file) {
  if (!exists(file)) return;
  const settings = readJson(file);
  if (!settings.hooks) return;
  for (const event of Object.keys(settings.hooks)) {
    settings.hooks[event] = settings.hooks[event]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !String(h.command || '').includes('harness-rtl')) }))
      .filter((g) => g.hooks.length > 0);
    if (!settings.hooks[event].length) delete settings.hooks[event];
  }
  backup(file);
  writeJson(file, settings);
}

function upsertRules(file, withCheck) {
  const text = exists(file) ? read(file).trimEnd() : '';
  const re = /<!-- harness-rtl:begin[\s\S]*?<!-- harness-rtl:end -->/;
  const block = rulesBlock(withCheck);
  const next = re.test(text) ? text.replace(re, block) : `${text}\n\n${block}`.trimStart();
  fs.mkdirSync(path.dirname(file), { recursive: true });
  backup(file);
  write(file, next + '\n');
}

function removeRules(file) {
  if (!exists(file)) return;
  const text = read(file);
  if (!text.includes('harness-rtl:begin')) return;
  const next = text.replace(/<!-- harness-rtl:begin[\s\S]*?<!-- harness-rtl:end -->\n?/g, '').trimEnd();
  backup(file);
  write(file, next + '\n');
}

function ensureYamlEnabled(file) {
  if (!exists(file)) return false;
  const text = read(file);
  if (/^\s*-\s*harness-rtl\s*$/m.test(text)) return true;

  const lines = text.split(/\r?\n/);
  const pluginsAt = lines.findIndex((l) => /^plugins:\s*$/.test(l));
  if (pluginsAt >= 0) {
    const enabledAt = lines.findIndex((l, i) => i > pluginsAt && /^\s{2}enabled:\s*$/.test(l));
    if (enabledAt >= 0) lines.splice(enabledAt + 1, 0, '    - harness-rtl');
    else lines.splice(pluginsAt + 1, 0, '  enabled:', '    - harness-rtl');
  } else {
    lines.push('plugins:', '  enabled:', '    - harness-rtl');
  }
  backup(file);
  write(file, lines.join('\n'));
  return true;
}

function removeYamlEnabled(file) {
  if (!exists(file)) return;
  const text = read(file);
  if (!/^\s*-\s*harness-rtl\s*$/m.test(text)) return;
  backup(file);
  write(file, text.replace(/^\s*-\s*harness-rtl\s*\r?\n?/m, ''));
}

/* --------------------------------------------------------------- install */

function installSkill(skillsDir, state, dry) {
  const dest = path.join(skillsDir, 'harness-rtl');
  if (dry) return dest;
  copyDir(path.join(ROOT, 'skill'), dest);
  write(path.join(dest, 'VERSION'), pkg.version + '\n');
  state.installedSkills[dest] = pkg.version;
  return dest;
}

// settings.json is synced between machines, so the command must not hold a user
// name or a bare "node" (it does not resolve on every machine). Pick the Mac or
// Windows runtime at run time and keep paths under $HOME.
function homePath(file) {
  const home = norm(HOME);
  const f = norm(file);
  return f.startsWith(home + '/') ? '$HOME' + f.slice(home.length) : f;
}

function portableNode(file, args = '') {
  const p = homePath(file);
  const mac = '/Applications/ChatGPT.app/Contents/Resources/cua_node/bin/node';
  const win = 'C:/Program Files/nodejs/node.exe';
  return `if [ -x "${mac}" ]; then "${mac}" "${p}"${args}; else "${win}" "${p}"${args}; fi`;
}

function installClaude(h, state, dry) {
  const hook = path.join(ROOT, 'dist', 'claude', 'fix-rtl.js');
  const rtl = path.join(ROOT, 'install', 'rtl.js');
  const lines = [];
  if (h.legacy && !has('--replace')) {
    lines.push('hook: skipped — a legacy farsi-rtl hook is active.');
    lines.push('      rerun with --replace to switch to harness-rtl (old files are kept).');
  } else if (!dry) {
    if (h.legacy) removeLegacyHooks(h.settings);
    copyFile(hook, h.adapterFile);
    upsertHookGroup(h.settings, 'MessageDisplay', portableNode(h.adapterFile), 10);
    // One line of context at session start, only when a harness changed.
    upsertHookGroup(h.settings, 'SessionStart',
      `[ -f "${homePath(rtl)}" ] && { ${portableNode(rtl, ' check --hook 2>/dev/null')}; } || true`, 20);
    if (!has('--no-rules')) upsertRules(h.rulesFile);
    lines.push(`hook: ${h.adapterFile}`);
    lines.push(`settings: MessageDisplay + SessionStart in ${h.settings}`);
  } else {
    lines.push(`hook: ${h.adapterFile} (dry run)`);
  }
  lines.push(has('--no-rules') ? 'rules: skipped (--no-rules)' : `rules: ${h.rulesFile}`);
  lines.push(`skill: ${installSkill(h.skillsDir, state, dry)}`);
  return lines;
}

function cleanupLegacyQoder(h) {
  const known = ['start-qoder-rtl.vbs', 'injector.mjs', 'make-shortcut.ps1', 'rtl-fix.page.js', 'injector.log'];
  if (exists(h.legacyDir) && known.some((n) => exists(path.join(h.legacyDir, n)))) {
    fs.rmSync(h.legacyDir, { recursive: true, force: true });
  }
  for (const desktop of [path.join(HOME, 'Desktop'), path.join(HOME, 'OneDrive', 'Desktop')]) {
    const lnk = path.join(desktop, 'Qoder RTL.lnk');
    if (exists(lnk)) { try { fs.rmSync(lnk, { force: true }); } catch {} }
  }
}

function installQoder(h, state, dry) {
  const skill = installSkill(h.skillsDir, state, dry);
  const hookFile = path.join(skill, 'qoder', 'hook.js');
  if (!dry) {
    const cmd = `"${process.execPath}" "${norm(hookFile)}"`;
    upsertHookGroup(h.settings, 'SessionStart', `${cmd} SessionStart`, 10);
    upsertHookGroup(h.settings, 'UserPromptSubmit', `${cmd} UserPromptSubmit`, 10);
    cleanupLegacyQoder(h);
  }
  return [
    `hook: SessionStart + UserPromptSubmit in ${h.settings}`,
    `script: ${hookFile}`,
    `skill: ${skill}`,
    'no launcher, no shortcut: Qoder loads the rule from its own settings.',
    'next: restart Qoder once (hook settings are read at startup).',
  ];
}

function installRulesOnly(h, state, dry, extra = []) {
  if (!dry && !has('--no-rules')) upsertRules(h.rulesFile, true);
  const lines = [has('--no-rules') ? 'rules: skipped (--no-rules)' : `rules: ${h.rulesFile}`];
  if (h.skillsDir) lines.push(`skill: ${installSkill(h.skillsDir, state, dry)}`);
  return lines.concat(extra);
}

function installHermes(h, state, dry) {
  const out = [];
  for (const profile of h.profiles) {
    const dest = path.join(profile, 'plugins', 'harness-rtl');
    if (!dry) {
      copyFile(path.join(ROOT, 'dist', 'hermes', 'plugin.js'), path.join(dest, 'desktop', 'plugin.js'));
      copyFile(path.join(ROOT, 'adapters', 'hermes', 'plugin.yaml'), path.join(dest, 'plugin.yaml'));
      copyFile(path.join(ROOT, 'adapters', 'hermes', '__init__.py'), path.join(dest, '__init__.py'));
      ensureYamlEnabled(path.join(profile, 'config.yaml'));
    }
    out.push(`plugin: ${dest}${dry ? '' : ' (enabled)'}`);
  }
  out.push(`skill: ${installSkill(h.skillsDir, state, dry)}`);
  out.push('next: restart Hermes Desktop.');
  return out;
}

function installCodex(h, state, dry) {
  if (!dry && !has('--no-rules')) upsertRules(h.rulesFile, true);
  return [
    has('--no-rules') ? 'rules: skipped (--no-rules)' : `rules: ${h.rulesFile}`,
    'renderer: nothing to inject — Codex desktop renders Persian bidi natively;',
    '          if a future build breaks that, see skill/references/update.md.',
    `skill: ${installSkill(h.skillsDir, state, dry)}`,
  ];
}

function install() {
  const all = detectAll();
  const list = targets.length ? all.filter((h) => targets.includes(h.id)) : all;
  const missing = targets.filter((t) => !all.some((h) => h.id === t));
  if (missing.length) {
    console.error(`not detected: ${missing.join(', ')}`);
    process.exitCode = 1;
  }
  if (!list.length) {
    console.error('No supported harness found. Run: node install/rtl.js detect');
    process.exitCode = 1;
    return;
  }

  const dry = has('--dry-run');
  const state = loadState();
  for (const h of list) {
    console.log(`\n${h.name}${h.version ? ' ' + h.version : ''}`);
    let lines;
    if (h.id === 'claude') lines = installClaude(h, state, dry);
    else if (h.id === 'qoder') lines = installQoder(h, state, dry);
    else if (h.id === 'hermes') lines = installHermes(h, state, dry);
    else if (h.id === 'codex') lines = installCodex(h, state, dry);
    else if (h.id === 'cline') lines = installRulesOnly(h, state, dry, ['format: safe isolates only; Cline does not render raw HTML']);
    else if (h.id === 'freebuff') lines = installRulesOnly(h, state, dry, ['format: safe isolates only; Freebuff has no raw HTML in chat']);
    else if (h.id === 'opencode') lines = installRulesOnly(h, state, dry, ['format: safe isolates only; OpenCode desktop strips raw HTML']);
    else if (h.id === 'zcode') lines = installRulesOnly(h, state, dry, ['format: safe isolates; HTML wrapper only if this build renders it']);
    else lines = installRulesOnly(h, state, dry, ['format: safe isolates only']);
    for (const line of lines) console.log('  ' + line);
  }
  if (!dry) {
    state.version = pkg.version;
    state.repo = ROOT;
    saveState(state);
    console.log(`\nstate: ${STATE_FILE}`);
    console.log(`verify: node install/rtl.js verify`);
  } else {
    console.log('\ndry run: nothing written');
  }
}

/* ---------------------------------------------------------------- verify */

function verifyClaude(h) {
  const problems = [];
  if (!exists(h.adapterFile)) problems.push('hook file missing');
  if (!settingsHas(h.settings)) problems.push('MessageDisplay hook missing from settings.json');
  if (!has('--no-rules') && !(exists(h.rulesFile) && read(h.rulesFile).includes('harness-rtl:begin'))) {
    problems.push('rules block missing from CLAUDE.md');
  }
  if (!problems.length) {
    const out = execFileSync(process.execPath, [h.adapterFile], {
      input: JSON.stringify({ message_text: 'پیام آزمایشی RTL' }),
      encoding: 'utf8',
      timeout: 8000,
    });
    if (!out.includes('\u2067')) problems.push('hook did not isolate Persian text');
  }
  return problems;
}

function verifyQoder(h) {
  const problems = [];
  if (!exists(h.hookFile)) problems.push('hook script missing');
  if (!settingsHas(h.settings)) problems.push('hook missing from settings.json');
  if (!problems.length) {
    for (const event of ['SessionStart', 'UserPromptSubmit']) {
      let out;
      try {
        out = execFileSync(process.execPath, [h.hookFile, event], { encoding: 'utf8', timeout: 8000 });
      } catch (err) {
        problems.push(`hook failed for ${event}`);
        continue;
      }
      let parsed;
      try { parsed = JSON.parse(out); } catch { problems.push(`hook output for ${event} is not JSON`); continue; }
      const outEvent = parsed.hookSpecificOutput && parsed.hookSpecificOutput.hookEventName;
      const ctx = parsed.hookSpecificOutput && parsed.hookSpecificOutput.additionalContext;
      if (outEvent !== event) problems.push(`hookEventName mismatch for ${event}`);
      if (!ctx || !ctx.includes('dir="rtl"')) problems.push(`direction rule missing for ${event}`);
      if (/[\u2066-\u2069]/.test(out)) problems.push(`bidi control leaked into ${event} output`);
    }
  }
  return problems;
}

function verifyRulesOnly(h) {
  const problems = [];
  if (!(exists(h.rulesFile) && read(h.rulesFile).includes('harness-rtl:begin'))) {
    problems.push(`rules block missing from ${h.rulesFile}`);
  }
  if (h.skillsDir && !exists(path.join(h.skillsDir, 'harness-rtl', 'SKILL.md'))) {
    problems.push('skill copy missing');
  }
  return problems;
}

function verifyHermes(h) {
  const problems = [];
  for (const profile of h.profiles) {
    if (!exists(path.join(profile, 'plugins', 'harness-rtl', 'desktop', 'plugin.js'))) {
      problems.push(`plugin missing in ${profile}`);
      continue;
    }
    const cfg = path.join(profile, 'config.yaml');
    if (!(exists(cfg) && /^\s*-\s*harness-rtl\s*$/m.test(read(cfg)))) {
      problems.push(`not enabled in ${cfg}`);
    }
  }
  return problems;
}

function verifyCodex(h) {
  const problems = [];
  if (!(exists(h.rulesFile) && read(h.rulesFile).includes('harness-rtl:begin'))) {
    problems.push('rules block missing from AGENTS.md');
  }
  return problems;
}

async function verify() {
  const all = detectAll();
  const list = targets.length ? all.filter((h) => targets.includes(h.id)) : all;
  const state = loadState();
  let failed = 0;

  for (const h of list) {
    if (!h.adapterInstalled) {
      console.log(`${h.name.padEnd(12)} not installed`);
      continue;
    }
    let problems;
    let note = '';
    if (h.id === 'claude') problems = verifyClaude(h);
    else if (h.id === 'qoder') {
      problems = verifyQoder(h);
      note = 'in-harness hook; answers get dir wrappers, UI chrome is not restyled';
    } else if (h.id === 'hermes') problems = verifyHermes(h);
    else if (h.id === 'codex') problems = verifyCodex(h);
    else problems = verifyRulesOnly(h);

    if (problems.length) {
      failed++;
      console.log(`${h.name.padEnd(12)} FAIL`);
      for (const p of problems) console.log('  - ' + p);
    } else {
      if (h.version) state.verified[h.id] = h.version;
      console.log(`${h.name.padEnd(12)} PASS ${h.version || ''}${note ? ' — ' + note : ''}`);
    }
  }

  saveState(state);
  if (failed) process.exitCode = 1;
}

/* ----------------------------------------------------------------- check */

function skillCopies(state) {
  const out = [];
  for (const dir of Object.keys(state.installedSkills)) {
    const file = path.join(dir, 'VERSION');
    if (!exists(file)) continue;
    if (read(file).trim() !== pkg.version) out.push(dir);
  }
  return out;
}

function check() {
  const all = detectAll();
  const state = loadState();
  const rows = all.map((h) => ({
    h,
    verified: state.verified[h.id] || null,
    tested: (manifest.harnesses.find((m) => m.id === h.id) || {}).tested || null,
  }));

  const notices = [];
  const rtlPath = norm(path.join(ROOT, 'install', 'rtl.js'));
  for (const { h, verified } of rows) {
    if (!h.adapterInstalled || !h.version) continue;
    if (verified !== h.version) {
      notices.push(`${h.name} is ${h.version}, but the skill was verified against ${verified || 'nothing'}; update the skill: node "${rtlPath}" install && node "${rtlPath}" verify ${h.id}.`);
    }
  }
  const staleSkills = skillCopies(state);
  if (staleSkills.length) {
    notices.push(`the installed skill copies are older than repo ${pkg.version}; update: node "${rtlPath}" install.`);
  }

  if (has('--hook')) {
    if (notices.length) {
      console.log(`harness-rtl: ${notices.join(' ')} Repeat this to the user in one line.`);
    }
    process.exitCode = notices.length ? 2 : 0;
    return;
  }

  console.log(`harness-rtl ${pkg.version} (released ${manifest.updated})`);
  for (const { h, verified, tested } of rows) {
    let status = 'ok';
    if (!h.adapterInstalled) status = 'not installed';
    else if (!h.version) status = 'version unknown';
    else if (verified !== h.version) status = 'UPDATE NEEDED';
    else if (tested !== h.version) status = 'verified locally, release behind';
    console.log(
      `${h.name.padEnd(12)} ${String(h.version || '-').padEnd(9)} verified ${String(verified || '-').padEnd(9)} ${status}`
    );
  }
  if (staleSkills.length) {
    console.log('\nstale skill copies (re-run install):');
    for (const dir of staleSkills) console.log('  ' + dir);
  }
  if (notices.length) {
    console.log('\n' + notices.join('\n'));
    process.exitCode = 2;
  }
  console.log('\nledger: ' + STATE_FILE + ' (versions and paths only, no conversation data)');
}

/* -------------------------------------------------------------- uninstall */

function uninstall() {
  const all = detectAll();
  const list = targets.length ? all.filter((h) => targets.includes(h.id)) : all;
  const state = loadState();

  for (const h of list) {
    if (h.id === 'claude') {
      removeHooks(h.settings);
      removeRules(h.rulesFile);
      fs.rmSync(path.dirname(h.adapterFile), { recursive: true, force: true });
    } else if (h.id === 'qoder') {
      removeHooks(h.settings);
      cleanupLegacyQoder(h);
    } else if (h.id === 'hermes') {
      for (const profile of h.profiles) {
        fs.rmSync(path.join(profile, 'plugins', 'harness-rtl'), { recursive: true, force: true });
        removeYamlEnabled(path.join(profile, 'config.yaml'));
      }
    } else if (h.id === 'codex') {
      removeRules(h.rulesFile);
    } else {
      removeRules(h.rulesFile);
    }
    if (h.skillsDir) fs.rmSync(path.join(h.skillsDir, 'harness-rtl'), { recursive: true, force: true });
    delete state.verified[h.id];
    console.log(`removed ${h.name}`);
  }
  saveState(state);
}

/* ------------------------------------------------------------------ main */

function help() {
  console.log(`harness-rtl ${pkg.version}

  detect [--json]                 installed harnesses, versions, adapter state
  install [id...] [--dry-run]     install adapters, rules and the skill
  verify [id...]                  check the adapter works; mark version verified
  check [--hook]                  UPDATE NEEDED when a harness changed
  uninstall [id...]               remove everything this tool installed
  build                           regenerate dist/ from engine/ + adapters/

ids: claude, qoder, hermes, codex
state: ${STATE_FILE}`);
}

async function main() {
  if (cmd === 'detect') {
    const rows = detectAll().map((h) => ({
      id: h.id,
      name: h.name,
      installed: true,
      version: h.version,
      adapter: h.adapterInstalled,
      surface: (manifest.harnesses.find((m) => m.id === h.id) || {}).surface || null,
      tested: (manifest.harnesses.find((m) => m.id === h.id) || {}).tested || null,
    }));
    if (has('--json')) {
      console.log(JSON.stringify({ tool: pkg.version, harnesses: rows }, null, 2));
    } else {
      console.log(`harness-rtl ${pkg.version}`);
      for (const r of rows) {
        console.log(`${r.name.padEnd(12)} ${String(r.version || '-').padEnd(9)} adapter ${r.adapter ? 'yes' : 'no '}  ${r.surface}`);
      }
      if (!rows.length) console.log('no supported harness found');
    }
    return;
  }
  if (cmd === 'install') return install();
  if (cmd === 'verify') return verify();
  if (cmd === 'check') return check();
  if (cmd === 'uninstall') return uninstall();
  if (cmd === 'build') {
    execFileSync(process.execPath, [path.join(ROOT, 'tools', 'build.js'), ...(has('--check') ? ['--check'] : [])], { stdio: 'inherit' });
    return;
  }
  help();
  if (cmd !== 'help' && cmd !== '--help' && cmd !== '-h') process.exitCode = 1;
}

main().catch((err) => {
  console.error('harness-rtl: ' + err.message);
  process.exitCode = 1;
});
