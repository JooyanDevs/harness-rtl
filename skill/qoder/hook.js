#!/usr/bin/env node
'use strict';
/*
 * Qoder hook: put the direction rule into the agent's context.
 *
 * Qoder exposes hooks in ~/.qoder/settings.json (SessionStart and
 * UserPromptSubmit). Unlike Claude Code, Qoder has no hook that can rewrite an
 * already-rendered answer, so the rule is applied by the agent while writing.
 * Qoder renders raw HTML in chat and keeps dir/align attributes (inline styles
 * are stripped), which is the only in-harness way to right-align an answer.
 *
 * Usage: node hook.js SessionStart|UserPromptSubmit
 * At session start it also runs the repo's `check --hook` so a harness update
 * reaches the user. Reads only the tool ledger and harness versions; no
 * network, no message content.
 */

const requested = String(process.argv[2] || 'SessionStart').trim();
const hookEventName = requested === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'SessionStart';

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

// Ask the repo's checker once per session; it knows which harness versions changed.
function updateNotice() {
  try {
    const state = JSON.parse(fs.readFileSync(path.join(os.homedir(), '.harness-rtl', 'state.json'), 'utf8'));
    const rtl = path.join(String(state.repo || ''), 'install', 'rtl.js');
    if (!state.repo || !fs.existsSync(rtl)) return '';
    try {
      return execFileSync(process.execPath, [rtl, 'check', '--hook'], {
        encoding: 'utf8',
        timeout: 5000,
        stdio: ['ignore', 'pipe', 'ignore'],
      }).trim();
    } catch (err) {
      return String((err && err.stdout) || '').trim();
    }
  } catch {
    return '';
  }
}

const RULE = [
  'harness-rtl direction rule, applied silently to every reply:',
  '- If the reply contains Persian/Arabic/Hebrew letters, right-align it:',
  '  <div dir="rtl" align="right">',
  '',
  '  markdown answer',
  '',
  '  </div>',
  '- Raw HTML is rendered here; dir/align survive. Do not use style="", it is stripped, and do not use <font>.',
  '- Put every paragraph, list and table inside the wrapper; nothing after the closing tag.',
  '- Put each fenced code block outside the wrapper and leave it byte-exact.',
  '- Pure English answers stay plain Markdown (LTR). Mixed Persian + English counts as Persian.',
].join('\n');

const context = hookEventName === 'SessionStart'
  ? [RULE, updateNotice()].filter(Boolean).join('\n\n')
  : RULE;

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName,
    additionalContext: context,
  },
}) + '\n');
