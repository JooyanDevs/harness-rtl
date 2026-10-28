---
name: harness-rtl
description: >
  Make Persian (Farsi) render right-to-left in the AI harness itself, not only
  in generated apps. Use when Persian text is scrambled, mirrored, left-aligned,
  truncated on the wrong side, or set in the wrong font; when the user asks for
  RTL / راست‌چین / به‌هم‌ریختگی / bidi / Vazirmatn in Claude Code, Qoder, Hermes,
  Codex, Cline, OpenCode, ZCode, Freebuff, DeepSeek or a terminal; or when a
  harness update may have broken RTL. Also use before publishing the harness-rtl
  repo.
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
| Qoder | `SessionStart` + `UserPromptSubmit` hooks | answers right-aligned via `<div dir="rtl" align="right">`; UI chrome and font stay Qoder's own |
| Hermes | desktop plugin | true RTL alignment, ellipsis, Vazirmatn |
| Codex | instructions block only | correct output shape; desktop already renders bidi |
| Cline | global rules file | order-safe answers; no raw HTML in chat |
| OpenCode | `AGENTS.md` + skill | order-safe answers; no raw HTML in chat |
| ZCode | `AGENTS.md` + skill | order-safe answers |
| Freebuff | `~/.knowledge.md` | order-safe answers |
| DeepSeek Harness | `AGENTS.md` + skill | order-safe answers |
| Terminals | instructions block only | order-safe text; a cell terminal cannot right-align |

In Qoder the hook carries the rule automatically. In every other harness without a
display hook, follow the rules block: Persian blocks right-to-left, pure English and
code untouched, never put a command or path inside a Persian sentence. Do not wrap
answers in HTML unless the harness is Qoder; other renderers show the tags as text.

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

Claude Code shows this notice by itself at session start. Everywhere else the
skill is the notice.

## 4. When something looks wrong

1. Persian scrambled but English fine → a display hook/adapter is missing. Install.
2. Lines align right but words are mirrored → an old build or a second bidi
   layer is active. Remove the older RTL fix before reinstalling.
3. Commands break when copied → a bidi isolate leaked into a code fence. This is
   a release blocker; fix `engine/text-fix.js` fence tracking first.
4. Everything right but the font is not Vazirmatn → the font must be installed
   on the system. The CSS asks for `Vazirmatn`, `Vazirmatn RD`, `Vazirmatn UI`
   and falls back to Segoe UI/Tahoma. Do not bundle or download fonts. Qoder
   is out of reach: it strips `style` and `<font>`, so its answers keep Qoder's
   own font; say so instead of promising Vazirmatn there.

## 5. Privacy contract (do not weaken)

The tool reads harness versions and config paths only. It never reads chat
content, transcripts, histories, tokens or environment secrets; it never sends
anything to a server; there is no network call and no background process.
Details: `references/privacy.md`.

## 6. References

- `references/rules.md` — direction policy, edge cases, what is left untouched.
- `references/update.md` — adapting to a new harness build and releasing.
- `references/privacy.md` — exact files read/written and the uninstall path.
