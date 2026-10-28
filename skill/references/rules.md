# Direction rules

## The rule

A text block is **RTL** when it contains at least one Persian/Arabic/Hebrew
letter (U+0590–U+06FF, U+0750–U+077F, U+08A0–U+08FF, presentation forms). It is
**LTR** otherwise. Mixed Persian + English is RTL: presence decides, never a
ratio.

Consequences, all intentional:

- `برای HERMES_DESKTOP_CDP_PORT چه مقداری؟` → RTL; the identifier keeps its own
  left-to-right order inside the Persian sentence.
- `Use the Persian label فارسی in this field` → RTL. A single Persian word flips
  the block. This is the requested product rule, and it is predictable. If a
  future UI has many English strings quoting Persian, pass a `directionForText`
  override rather than editing the rule in place.
- Persian digits `۱۲۳۴` → RTL.
- `Hello world 1234` → untouched.

## Resolution per surface

| Surface | How direction is decided | Alignment |
|---|---|---|
| DOM (Qoder, Hermes) | each element that directly owns text; `dir="rtl"`, `text-align: start`, `unicode-bidi: isolate` | true right/start alignment |
| Claude Code answers | each displayed line; one RLI…PDI isolate around the line | order only; the app owns alignment |
| Terminal | model output shape; commands on their own lines | none; terminals are LTR cell grids |

## Never touched

- `pre`, `code`, `kbd`, `samp`, `textarea`, inputs, `contenteditable`, SVG, math.
  Commands, paths and identifiers must stay byte-exact.
- Fenced code blocks in the Claude hook. An invisible PDI riding along on
  copy-paste breaks PowerShell/bash.
- The saved transcript and what the model sees. Display-only transforms must
  never write to disk.
- Document base direction. The app chrome stays LTR; only Persian-bearing
  elements flip.
- Table column order. Cells decide individually (`unicode-bidi: plaintext`);
  rows are not mirrored.

## Known trade-offs

- The Claude hook strips inline Markdown on Persian lines (`code`, bold, links)
  so the line becomes one run and orders correctly. English lines keep styling.
- Streaming: a code fence split across two hook deltas can have its tail treated
  as prose for that chunk. It is never worse than no fix.
- A single English sentence that quotes one Persian word turns RTL.
- Terminals cannot right-align. Use a GUI harness for reading-heavy Persian; in
  terminals the skill only guarantees readable order and copy-safe commands.
