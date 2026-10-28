/*
 * Line-level fix for harnesses that can only rewrite displayed text
 * (Claude Code's MessageDisplay hook, terminal renderers).
 *
 * A plain RTL line wrapped in RLI(U+2067)…PDI(U+2069) is ordered correctly by
 * Chromium's bidi algorithm. A line whose inline Markdown becomes its own DOM
 * element (code, bold, links) is ordered piece-by-piece regardless of any
 * isolate, so those markers are stripped on Persian lines only. Fenced code is
 * never touched: an invisible PDI riding along on copy-paste breaks the command.
 */
(function (root) {
  'use strict';

  var dir = root.HarnessRtlDirection;
  if (!dir && typeof require === 'function') dir = require('./direction.js');
  var RTL_RE = dir.RTL_CHAR;

  var RLI = String.fromCharCode(0x2067);
  var PDI = String.fromCharCode(0x2069);

  // Leading block markers stay before the isolate so the line still parses as
  // a list item / heading / blockquote.
  var MARKER_RE = /^(\s*(?:[-*+]\s+|\d+\.\s+|#{1,6}\s+|>\s+)*)/;
  var TABLE_ROW_RE = /^\s*\|.*\|\s*$/;
  var SEPARATOR_CELL_RE = /^\s*:?-+:?\s*$/;
  var FENCE_RE = /^\s{0,3}(`{3,}|~{3,})(.*)$/;

  // _ / __ are left alone so identifiers like MAX_THINKING_TOKENS survive.
  function stripInlineMarkup(text) {
    return text
      .replace(/`([^`\n]+)`/g, '$1')
      .replace(/!\[([^\]\n]*)\]\([^)\n]+\)/g, '$1')
      .replace(/\[([^\]\n]+)\]\([^)\n]+\)/g, '$1')
      .replace(/\*\*\*([^*\n]+?)\*\*\*/g, '$1')
      .replace(/\*\*([^*\n]+?)\*\*/g, '$1')
      .replace(/\*([^*\n]+?)\*/g, '$1');
  }

  function wrapLine(line) {
    var markers = line.match(MARKER_RE);
    var prefix = markers ? markers[0] : '';
    var rest = line.slice(prefix.length);
    var trailing = (rest.match(/(\s*)$/) || ['', ''])[1];
    var core = trailing ? rest.slice(0, rest.length - trailing.length) : rest;
    if (!core) return line;

    core = stripInlineMarkup(core);
    if (core.charCodeAt(0) !== 0x2067) core = RLI + core + PDI;
    return prefix + core + trailing;
  }

  function wrapCell(cell) {
    var leading = (cell.match(/^(\s*)/) || ['', ''])[0];
    var trailing = (cell.match(/(\s*)$/) || ['', ''])[0];
    var core = cell.slice(leading.length, cell.length - trailing.length);
    if (!core || !RTL_RE.test(core)) return cell;
    var fixed = stripInlineMarkup(core);
    if (fixed.charCodeAt(0) !== 0x2067) fixed = RLI + fixed + PDI;
    return leading + fixed + trailing;
  }

  // Wrapping a whole table row puts every pipe inside one RTL run and reverses
  // the column order; only each cell's text gets wrapped.
  function wrapTableRow(line) {
    return line
      .split('|')
      .map(function (cell) { return SEPARATOR_CELL_RE.test(cell) ? cell : wrapCell(cell); })
      .join('|');
  }

  function transform(text) {
    var lines = text.split('\n');
    var fence = null;

    for (var i = 0; i < lines.length; i++) {
      var line = lines[i];
      var m = line.match(FENCE_RE);

      if (m) {
        var marker = m[1][0];
        var len = m[1].length;
        if (!fence) fence = { marker: marker, len: len };
        else if (marker === fence.marker && len >= fence.len && m[2].trim() === '') fence = null;
        continue;
      }

      if (fence) continue;
      if (!RTL_RE.test(line)) continue;

      lines[i] = TABLE_ROW_RE.test(line) ? wrapTableRow(line) : wrapLine(line);
    }

    return lines.join('\n');
  }

  var api = { transform: transform };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HarnessRtlText = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
