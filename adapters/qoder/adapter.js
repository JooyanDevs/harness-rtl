/* Qoder renderer entry: installed by the CDP injector. */
(function (root) {
  'use strict';
  function boot() {
    root.__qoderHarnessRtl = root.HarnessRtlDom.install({ font: true, composer: true });
  }
  if (document.body) boot();
  else document.addEventListener('DOMContentLoaded', boot, { once: true });
})(typeof globalThis !== 'undefined' ? globalThis : this);
