---
name: harness-rtl
description: >
  Make Persian (Farsi) render right-to-left in the AI harness itself, not only
  in generated apps. Use when Persian text is scrambled, mirrored, left-aligned,
  truncated on the wrong side, or set in the wrong font; when the user asks for
  RTL / راست‌چین / به‌هم‌ریختگی / bidi / Vazirmatn in Claude Code, Qoder, Hermes,
  Codex or a terminal; or when a harness update may have broken RTL. Also use
  before publishing the harness-rtl repo.
license: MIT
---

# Harness RTL

Persian UI in AI harnesses, done once and kept working across harness updates.

The rule is fixed: **any Persian/Arabic/Hebrew letter makes a block RTL; pure
English/code stays LTR; mixed is RTL.** Code fences are never rewritten.

## 0. Find the tool

Read `~/.harness-rtl/state.json` and use its `repo` path. If it does not exist,
look for a clone named `harness-rtl`; if still missing, ask the user for the
clone path or offer:

```bash
git clone https://github.com/JooyanDevs/harness-rtl ~/harness-rtl
```

Every command below is `node "<repo>/install/rtl.js" <command>`.

## 1. Never claim a fix without this sequence

```bash
node "<repo>/install/rtl.js" detect --json   # what is installed, which versions
node "<repo>/install/rtl.js" install         # copy adapters, rules, skill
node "<repo>/install/rtl.js" verify          # proves the adapter runs
```

`verify` marks the current harness version as verified in the local ledger.
Do not report success until it prints PASS for the harness you touched.

## 2. What each harness gets

| Harness | Surface | Result |
|---|---|---|
| Claude Code | `MessageDisplay` hook + `SessionStart` notice | correct order in answers, code untouched |
| Qoder | CDP renderer script, launched via `Qoder RTL` | true RTL alignment, ellipsis, Vazirmatn, composer `dir=auto` |
| Hermes | desktop plugin | true RTL alignment, ellipsis, Vazirmatn |
| Codex | instructions block only | correct output shape; desktop already renders bidi |
| Terminals | instructions block only | order-safe text; a cell terminal cannot right-align |

Qoder must be started from the **Qoder RTL** shortcut after install. If Qoder
was already running, say so plainly and let the user restart it.

## 3. Update notices (self-update)

Run `check` at the start of any RTL task and when the user says a harness was
updated:

```bash
node "<repo>/install/rtl.js" check
```

- Exit `0`: nothing to do.
- Exit `2` / `UPDATE NEEDED`: a harness version changed since it was verified.
  Say it in one line, then run `verify`. If PASS, the fix survived; if FAIL,
  follow `references/update.md`, patch, test, bump, release.
- "release behind": the local adapter works but the published manifest is older.
  Only the maintainer acts on this; tell the user a skill release is due.

Claude Code shows this notice by itself at session start. Other harnesses have
no display hook, so the skill is the notice.

## 4. When something looks wrong

1. Persian scrambled but English fine → a display hook/adapter is missing. Install.
2. Lines align right but words are mirrored → an old build or a second bidi
   layer is active. Compare `detect` with the legacy artifacts warning; remove
   the old fix before reinstalling.
3. Commands break when copied → a bidi isolate leaked into a code fence. This is
   a release blocker; fix `engine/text-fix.js` fence tracking first.
4. Everything right but the font is not Vazirmatn → the font must be installed
   on the system. The CSS asks for `Vazirmatn`, `Vazirmatn RD`, `Vazirmatn UI`
   and falls back to Segoe UI/Tahoma. Do not bundle or download fonts.

## 5. Privacy contract (do not weaken)

The tool reads harness versions and config paths only. It never reads chat
content, transcripts, histories, tokens or environment secrets; it never sends
anything to a server; the only network call is loopback CDP to the harness the
user is already running. Details: `references/privacy.md`.

## 6. References

- `references/rules.md` — direction policy, edge cases, what is left untouched.
- `references/update.md` — adapting to a new harness build and releasing.
- `references/privacy.md` — exact files read/written and the uninstall path.
