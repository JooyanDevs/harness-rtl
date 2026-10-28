/*
 * Claude Code MessageDisplay adapter.
 * Reads one hook event on stdin, prints the isolated display text.
 * On any error it prints nothing, so the app shows the original message.
 * No shebang: the build concatenates this after the shared engine.
 */
'use strict';

var data = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', function (chunk) { data += chunk; });
process.stdin.on('end', function () {
  try {
    var input = JSON.parse(data);
    var text = input && (typeof input.delta === 'string' ? input.delta : input.message_text);
    if (typeof text !== 'string' || text.length === 0) return;

    var fixed = globalThis.HarnessRtlText.transform(text);
    if (fixed === text) return;

    process.stdout.write(JSON.stringify({
      hookSpecificOutput: {
        hookEventName: 'MessageDisplay',
        displayContent: fixed,
      },
    }));
  } catch (_) {
    // print nothing → app shows original text
  }
});
