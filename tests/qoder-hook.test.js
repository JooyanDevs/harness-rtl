'use strict';
/* Qoder has no display hook; its hook only injects the wrapper rule. */
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

const HOOK = path.join(__dirname, '..', 'skill', 'qoder', 'hook.js');

for (const event of ['SessionStart', 'UserPromptSubmit']) {
  test(`qoder hook emits the rule for ${event}`, () => {
    const out = execFileSync(process.execPath, [HOOK, event], { encoding: 'utf8' });
    const parsed = JSON.parse(out);
    assert.equal(parsed.hookSpecificOutput.hookEventName, event);
    assert.match(parsed.hookSpecificOutput.additionalContext, /dir="rtl"/);
    assert.doesNotMatch(out, /[\u2066-\u2069]/);
  });
}
