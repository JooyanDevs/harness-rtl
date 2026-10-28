'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { transform } = require('../engine/text-fix.js');

const RLI = '\u2067';
const PDI = '\u2069';

test('a Persian line is isolated once', () => {
  assert.equal(transform('سلام دنیا'), `${RLI}سلام دنیا${PDI}`);
});

test('an English line is untouched', () => {
  assert.equal(transform('Hello world'), 'Hello world');
});

test('mixed line keeps its Persian order and is idempotent', () => {
  const once = transform('برای HERMES_DESKTOP_CDP_PORT چه مقداری؟');
  assert.equal(once, `${RLI}برای HERMES_DESKTOP_CDP_PORT چه مقداری؟${PDI}`);
  assert.equal(transform(once), once);
});

test('inline markdown is stripped on Persian lines only', () => {
  assert.equal(
    transform('برای `npm test` و **مهم** از [اینجا](https://x.dev) کمک بگیر'),
    `${RLI}برای npm test و مهم از اینجا کمک بگیر${PDI}`,
  );
  assert.equal(transform('run `npm test`'), 'run `npm test`');
});

test('list markers stay outside the isolate', () => {
  assert.equal(transform('- سلام'), `- ${RLI}سلام${PDI}`);
});

test('fenced code is never touched, even with Persian inside', () => {
  const src = "```bash\n$env:X = '<رمز-فعلی>'; node backup.js\n```";
  assert.equal(transform(src), src);
});

test('a fence tagged fa becomes a right-aligned hard-break blockquote', () => {
  const out = transform('```fa\nسلام دنیا\n\nhello\n```');
  assert.equal(out, `> ${RLI}سلام دنیا${PDI}  \n>\n> hello  `);
});

test('only the exact tag fa opts in', () => {
  const src = '```fab\nسلام\n```';
  assert.equal(transform(src), src);
});

test('table rows wrap cells, not the row', () => {
  const out = transform('| نام | مقدار |');
  assert.equal(out, `| ${RLI}نام${PDI} | ${RLI}مقدار${PDI} |`);
  assert.ok(out.split('|').length === 4);
});
