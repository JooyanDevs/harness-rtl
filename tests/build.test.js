'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { execFileSync } = require('node:child_process');
const path = require('node:path');

test('committed dist files match engine + adapters', () => {
  const out = execFileSync(process.execPath, [path.join(__dirname, '..', 'tools', 'build.js'), '--check'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.match(out, /in sync/);
});
