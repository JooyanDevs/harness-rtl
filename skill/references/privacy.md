# Privacy

## What is read

- Harness versions: `claude --version`, `hermes --version`, `codex --version`,
  and the newest `.qoder-versions/<version>` folder.
- Config paths and their content where the tool must patch them:
  `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.codex/AGENTS.md`,
  Hermes `profiles/<name>/config.yaml`.
- For live verification only: the Qoder renderer over loopback CDP
  (`127.0.0.1:9227`), asking for one number — how many elements are marked.

## What is never read

Chat messages, transcripts, session files, memory, prompts, credentials, tokens,
environment secrets, browser profiles, or any file outside the paths above.
There is no telemetry, analytics, crash report or update ping.

## What is written

- `~/.harness-rtl/state.json` — schema version, repo path, tool version, verified
  harness versions, installed skill paths. No content.
- Adapter files under the harness config dir (`hooks/harness-rtl`,
  `.qoder/harness-rtl`, `plugins/harness-rtl`).
- A managed block in `CLAUDE.md` / `AGENTS.md` between `harness-rtl:begin` and
  `harness-rtl:end`, and hook entries containing `harness-rtl` in
  `settings.json`.
- A rolling backup next to any file it edits: `<file>.harness-rtl.bak`.

## Network

None, except the loopback CDP check described above. `install` and `check` work
offline. There is no auto-download of fonts or binaries.

## Removing everything

```bash
node install/rtl.js uninstall
```

Then delete any `Qoder RTL` shortcut you created and the `.harness-rtl.bak`
files if you no longer want the pre-install copies. The cloned repo can be
deleted afterwards.

## CDP caveat

The Qoder launcher opens the DevTools protocol on loopback so the injector can
attach. While Qoder runs that way, any local process can attach to its renderer.
Quit Qoder to close the port. This is the same trade-off as running any Electron
app with `--remote-debugging-port`; it is why the launcher is opt-in rather than
the normal Qoder entry point.
