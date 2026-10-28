/* Hermes desktop plugin entry. */
export default {
  id: 'harness-rtl',
  name: 'Harness RTL (Persian)',
  defaultEnabled: true,
  register() {
    globalThis.__hermesHarnessRtl = globalThis.HarnessRtlDom.install({ font: true, composer: false });
  },
};
