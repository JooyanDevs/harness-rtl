# Privacy

## What is read

- Harness versions: `claude --version`, `hermes --version`, `codex --version`,
  `opencode --version`, and the newest `.qoder-versions/<version>` folder.
- The session-start hook reads `~/.harness-rtl/state.json` and runs the local
  `check`: harness versions and skill version stamps, nothing else.
- Config paths and their content where the tool must patch them:
  `~/.claude/settings.json`, `~/.claude/CLAUDE.md`, `~/.qoder/settings.json`,
  `~/.codex/AGENTS.md`, `~/.config/opencode/AGENTS.md`, `~/.zcode/AGENTS.md`,
  `~/.dsh/AGENTS.md`, `~/.knowledge.md`, `Documents/Cline/Rules/`, and Hermes
  `profiles/<name>/config.yaml`.

## What is never read

Chat messages, transcripts, session files, memory, prompts, credentials, tokens,
environment secrets, browser profiles, or any file outside the paths above.
There is no telemetry, analytics, crash report or update ping.

## What is written

- `~/.harness-rtl/state.json` — schema version, repo path, tool version, verified
  harness versions, installed skill paths. No content.
- Hook, plugin and rule files under the harness config dir
  (`~/.claude/hooks/harness-rtl`, `plugins/harness-rtl`,
  `skills/harness-rtl`, and the rules paths above).
- A managed block between `harness-rtl:begin` and `harness-rtl:end`, and hook
  entries containing `harness-rtl` in `settings.json`.
- A rolling backup next to any file it edits: `<file>.harness-rtl.bak`.

## Network

None. `install`, `verify` and `check` work offline. No background process is
started and nothing listens on a port. There is no auto-download of fonts or
binaries.

## Removing everything

```bash
node install/rtl.js uninstall
```

Then delete the `.harness-rtl.bak` files if you no longer want the pre-install
copies. The cloned repo can be deleted afterwards.
