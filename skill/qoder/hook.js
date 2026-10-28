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
 * Reads nothing, writes nothing, no network.
 */

const requested = String(process.argv[2] || 'SessionStart').trim();
const hookEventName = requested === 'UserPromptSubmit' ? 'UserPromptSubmit' : 'SessionStart';

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

process.stdout.write(JSON.stringify({
  hookSpecificOutput: {
    hookEventName,
    additionalContext: RULE,
  },
}) + '\n');
