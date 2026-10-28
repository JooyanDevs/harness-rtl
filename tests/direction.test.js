'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { directionForText } = require('../engine/direction.js');

test('pure Persian is RTL', () => {
  assert.equal(directionForText('سلام دنیا'), 'rtl');
});

test('pure English is left alone', () => {
  assert.equal(directionForText('Choose API provider'), null);
  assert.equal(directionForText('1234 --flag'), null);
});

test('mixed text is RTL, even when Latin is longer', () => {
  assert.equal(directionForText('برای HERMES_DESKTOP_CDP_PORT چه مقداری انتخاب کنم؟'), 'rtl');
  assert.equal(directionForText('symlink را برای این پوشه دوباره بساز'), 'rtl');
});

test('one Persian word inside an English sentence is RTL (presence rule)', () => {
  assert.equal(directionForText('Use the Persian label فارسی in this field'), 'rtl');
});

test('Persian digits count as RTL', () => {
  assert.equal(directionForText('۱۲۳۴'), 'rtl');
});

test('empty and non-string input is left alone', () => {
  assert.equal(directionForText(''), null);
  assert.equal(directionForText(undefined), null);
});
