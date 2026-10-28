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

The launcher always starts the newest `.qoder-versions/<version>` build, so a
Qoder update lands on the same injector. Check:

```bash
cscript //nologo "%USERPROFILE%\.qoder\harness-rtl\start-qoder-rtl.vbs" --check
```

`rtl_active=True` means the debug port is on. The renderer script is
selector-agnostic (it walks text nodes), so DOM restyles rarely break it; a
rename of the process, the `--remote-debugging-port` flag or the version folder
layout will. Only then edit `adapters/qoder/start-qoder-rtl.vbs`.

### Hermes

The plugin contract is `plugin.yaml` + `desktop/plugin.js` exporting
`{ id, name, register }`. If Hermes changes that contract, `verify` fails on the
file/enable check; update `adapters/hermes/adapter.js` and reinstall.

### Codex

No display hook exists (hooks may rewrite tool input, not assistant output).
Codex desktop renders bidi itself. If that regresses, the only supported action
is the instructions block plus a clear report; keep `engine/` untouched.

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
