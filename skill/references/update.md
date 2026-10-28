# Adapting to a new harness build

Harnesses change constantly. A version bump is not automatically a break, but it
must be verified. This is the loop when `check` says UPDATE NEEDED.

## 1. Reproduce before touching code

```bash
node install/rtl.js detect --json
node install/rtl.js check
```

Open the harness and look at a message that mixes Persian with a Latin
identifier or a number. Note exactly what is wrong:

- wrong word order → text-level bidi (hook) problem;
- right order but left-aligned / wrong ellipsis side → DOM (CSS) problem;
- commands break on copy → isolate leaked into code;
- Persian shows but the font is wrong → font family names changed.

If the same message is fine, run `verify`; PASS marks the version verified and
the notice goes away.

## 2. Find the broken surface

### Claude Code

`MessageDisplay` and `SessionStart` in `~/.claude/settings.json` are the only
surfaces used. If a build removes `MessageDisplay`, the hook is silently ignored:
`verify` catches it because the fixture no longer contains RLI. Fall back to the
instructions block and report the limitation; do not fake a fix.

### Qoder

Qoder reads hooks from `~/.qoder/settings.json` and renders raw HTML in chat, so
there is no launcher, injector or debug port. The two things that can break:

- the hook events `SessionStart` / `UserPromptSubmit` are renamed or stop
  accepting `additionalContext` — `verify` fails on the JSON round-trip;
- the Markdown sanitizer drops `dir`/`align` on `div` — the answer still orders
  correctly but loses alignment. Check by asking Qoder for a one-line Persian
  answer and inspecting the HTML; if `dir` is gone, fall back to the
  instructions block and say so.

The hook script lives in the installed skill (`skills/harness-rtl/qoder/hook.js`);
edit it in the repo and reinstall.

### Hermes

The plugin contract is `plugin.yaml` + `desktop/plugin.js` exporting
`{ id, name, register }`. If Hermes changes that contract, `verify` fails on the
file/enable check; update `adapters/hermes/adapter.js` and reinstall.

### Rules-only harnesses (Codex, Cline, OpenCode, ZCode, Freebuff, DeepSeek)

These have no display hook. Codex desktop renders bidi itself; the others render
plain Markdown. The only lever is the instructions block, so a regression means
the model stopped following it — tighten the wording in `RULES_BLOCK`
(`install/rtl.js`) and reinstall. Do not claim alignment these UIs cannot do.

## 3. Patch the smallest layer

- Order-only bug → `engine/text-fix.js`.
- Alignment / ellipsis / font bug → `engine/dom-fix.js` or its CSS.
- Loader or launch bug → that harness's `adapters/<id>/`.
- Never fork the direction rule. `engine/direction.js` is the single source.

Then:

```bash
node tools/build.js          # regenerate dist/
node --test                  # classifier, text hook, build sync, headless DOM
node install/rtl.js verify   # live, on the updated harness
```

The headless test runs whichever Chromium is installed; set `CHROME_PATH` if
none is found.

## 4. Release

1. Bump `package.json` version.
2. In `install/harnesses.json`: set `tested` to the harness version and update
   `updated` (ISO date).
3. Commit, tag (`vX.Y.Z`), push.
4. Existing users see the notice on next `check` or Claude session start.

Do not bump `tested` without a PASS on that exact version.

## 5. When the fix cannot be restored quickly

```bash
node install/rtl.js uninstall <id>
```

Tell the user in one line what is temporarily unsupported. A silently broken
display hook or a half-working injector is worse than none.
