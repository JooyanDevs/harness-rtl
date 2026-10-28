/*
 * The one direction rule, shared by every adapter and both runtimes.
 *
 * Product rule: any Persian/Arabic/Hebrew letter makes a text block RTL;
 * pure Latin/ASCII stays LTR; mixed text is RTL. Presence decides, not ratio.
 * This file is a plain script on purpose: the browser adapters load it as a
 * script, Node adapters require() it, and the build concatenates it.
 */
(function (root) {
  'use strict';

  var RTL_CHAR = /[\u0590-\u06ff\u0750-\u077f\u08a0-\u08ff\ufb1d-\ufdff\ufe70-\ufeff]/;

  function directionForText(text) {
    return typeof text === 'string' && RTL_CHAR.test(text) ? 'rtl' : null;
  }

  var api = { RTL_CHAR: RTL_CHAR, directionForText: directionForText };
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.HarnessRtlDirection = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
