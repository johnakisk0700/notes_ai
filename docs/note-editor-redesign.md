# Note editor — paper-theme internals redesign (plan)

> **Status:** spec / not yet implemented. You're taking `NoteEditor.tsx`; this is the blueprint.
> **Decided together:** **Refined boxed tray** for the controls · keep the **divider rules** ·
> keep the **note-like serif title** · give the secondary buttons **outlines** · add **clearance
> under the coil**. Paper stays **line-less** (divider rules only — no ruled writing lines).

The dialog shell already reads as a steno pad (stacked loose leaves, opaque top sheet + paper
grain, `TopSpiralBinding` coil). This plan is only about the **internals** that sit on that sheet.

---

## 1. What we're fixing

The internals were three translucent `bg-background/40` boxes (title, toolbar, writing area).
Translucent fills sit on top of the paper grain and read as washed-out, sunken shadcn
boxes‑in‑a‑box — the exact anti‑pattern the theme already solved for chat panels (see
`.nb-panel` / `.nb-panel-quiet` in `index.css`: *"translucent tints bleed paper grain"*).

Two earlier passes overshot in opposite directions:

- **Pass A** stripped *all* structure → controls floated on bare paper, too plain.
- **Pass B** framed them but the execution was rough.

This plan keeps the framing idea (you picked **refined boxed tray**) but executes it cleanly:
**one defined control tray** on top, an **open writing page** below, **outlined** controls.

---

## 2. Principles (hold these)

1. **Controls live in a SOLID tray** — `.nb-panel-quiet`, never a translucent `bg-*/40` (grain bleed).
2. **Structure = divider rules, not nested boxes.** One horizontal rule splits the tray; the
   toolbar's vertical group dividers are the rest.
3. **The writing field is OPEN on the bare sheet.** This is the part that "looks like a note."
4. **Buttons read as physical controls:** secondary = `outline`, primary (Save) = ink, close = ghost.
5. **One ink accent.** Active formatting toggles are *inked* (primary), not shadcn grey.
6. **Line-less paper stays line-less.** Divider rules only; do **not** re-add ruled/margin lines.

---

## 3. Target layout

**Desktop (`lg`):**

```
 (coil straddles the top edge)
        ↓  generous clearance  (lg:pt-20 — was pt-14, too tight)
 ┌─ control tray  (.nb-panel-quiet · rounded-lg · border · shadow-sm) ───────────┐
 │  Τίτλος (serif, borderless, on the tray)        ✨AI    │    [ Save ]   ✕     │  ← title + actions
 │  ───────────────────────────────────────────────────────────────────────────│  ← divider rule
 │  B  I  S  </>   │   H1  H2   │   •   1.   "                                    │  ← formatting
 └───────────────────────────────────────────────────────────────────────────────┘
        ↓  gap-3
 [ writing field — open on the bare sheet …………………………………………………… ]
 [ …………………………………………………………………………………………………… 🎙 (outline) ]
```

**Mobile (`<lg`):** the coil is hidden and the dialog is full-bleed, so `pt-6` is fine. The tray
spans full width; if the title + actions row gets tight, let it wrap (`flex-wrap`) or drop the
Save label to its icon under `sm`.

---

## 4. Component-by-component spec

### 4.1 Outer grid & coil clearance
`NoteEditor.tsx`, the `EditorCore` return wrapper.

- **Clearance:** bump the desktop top padding so the tray clears the coil. The coil's wire/holes
  land ≈28px onto the sheet; `lg:pt-14` (56px) felt cramped. Use **`lg:pt-20`** (80px ≈ 50px gap).
  Tunable `lg:pt-16`–`lg:pt-24`. Keep `pt-6` for mobile.
- **Rows:** with actions moved into the tray (4.6 option A) →
  `grid-rows-[auto_1fr]` (tray, writing field). If you keep a separate header (option B) →
  `grid-rows-[auto_auto_1fr]`.

```tsx
<div className="relative z-10 grid h-full min-h-0 grid-rows-[auto_1fr] gap-3 p-4 pt-6 lg:pt-20" tabIndex={0}>
```

### 4.2 The control tray
A single solid, bordered panel that holds the title + tools.

```tsx
<div className="nb-panel-quiet flex flex-col gap-2 rounded-lg border p-2 shadow-sm">
  {/* title + actions row */}
  {/* <Separator /> */}
  {/* <NoteToolbar /> */}
</div>
```

- `.nb-panel-quiet` (already in `index.css`) = `color-mix(foreground 5%, card)` fill + a slightly
  inked border. **Solid**, so no grain bleed — this is the "box" you approved.
- `shadow-sm` is the theme's hard-offset shadow → a subtle "stamped" lift off the page.

### 4.3 Title row (serif, on the tray)
Keep the look you liked: borderless, brand serif, small sans placeholder. Either keep the shadcn
`Input` with overrides (shown) or use a raw `<input>`.

```tsx
<div className="flex items-center gap-2">
  <Input
    id="note_title"
    value={noteTitle || ''}
    onChange={e => setNoteTitle(e.target.value)}
    placeholder="Untitled — leave blank to let AI name it"
    className="h-11 flex-1 border-0 bg-transparent px-0.5 font-serif text-2xl font-medium
               tracking-tight shadow-none focus-visible:ring-0
               placeholder:font-sans placeholder:text-sm placeholder:font-normal
               placeholder:tracking-normal md:text-2xl dark:bg-transparent"
  />
  {/* AI fill + (option A) Save + Close go here, right-aligned */}
</div>
```

> ⚠️ **Gotcha:** shadcn `Input` ships `md:text-sm`, which would shrink the title back down on
> desktop. The explicit `md:text-2xl` above defeats it. Keep it.

**Alignment & spacing.** The first pass used `h-auto p-0 leading-tight`, which is what looked off —
a big serif crammed into a height-of-text box with no padding sits tight and centers unevenly. Fixes:

- **`h-auto` → `h-11`**: a fixed 44px height lets the browser vertically center the serif cleanly
  (kills the "sits a touch high/low" wobble) and gives the line room to breathe.
- **drop `leading-tight`**: at `h-11` the height owns vertical rhythm; `leading-tight` (1.25) only
  risks pinching the serif's ascenders/descenders. Let line-height default.
- **`p-0` → `px-0.5`**: nudges the caret/text off the hard edge without visibly leaving the margin.
- **more room (optional):** bump the tray to `p-3` (from `p-2`) so the whole control zone is airier.
- **optical left edge (optional):** the title's first glyph sits at the tray margin, while the
  toolbar glyphs are inset *inside* their toggles — so the title can read ~8px left of the tools. If
  you want them to line up, add `pl-1.5` to the title (or `-ml-1` the toolbar root). Otherwise leave
  it flush — a page title sitting at the margin is fine.

*Optional:* extract this into `NoteTitleInput.tsx` if you want to reuse it elsewhere.

### 4.4 Divider rule
One horizontal rule inside the tray, between the title row and the toolbar — this is the "notepad
line" you liked.

```tsx
<Separator className="bg-border/60" />   // from @/components/ui/separator
```

### 4.5 Formatting toolbar — `NoteToolbar.tsx`
Keep the `useEditorState` active-state wiring (Tiptap v3 needs it). Two style points:

- **No own box** — the tray frames it. Root stays:
  ```tsx
  <div className={cn('flex flex-wrap items-center gap-0.5', className)}>
  ```
- **Inked toggles** — active = ink, hover = faint graphite, not shadcn grey:
  ```tsx
  className="size-8 rounded-md text-foreground/60
             hover:bg-foreground/5 hover:text-foreground
             data-[state=on]:bg-primary/10 data-[state=on]:text-primary
             data-[state=on]:hover:bg-primary/15 data-[state=on]:hover:text-primary"
  ```
- Keep `onMouseDown={e => e.preventDefault()}` on each toggle (preserves the editor selection).
- Group dividers stay vertical rules: `<Separator orientation="vertical" className="mx-0.5 h-5" />`.

*Optional (out of scope):* extract a generic `Common/Toolbar` compound (`Toolbar` /
`Toolbar.Toggle` / `Toolbar.Divider`) if other surfaces want the same inked rail.

### 4.6 Header actions (Save / Close) — placement
You called these the "AdditionalActions." Pick one:

- **Option A — in the tray, top-right (recommended).** Put Save + Close on the title row's right,
  after the AI button. This pulls them *down* off the coil (so nothing crowds the top but the tray)
  and unifies all controls in one bar. Keep the hidden `DialogTitle` for a11y anywhere inside the
  dialog.
- **Option B — slim header above the tray.** Keep the current separate actions row, just inherit
  the new `lg:pt-20` clearance. Smaller diff, but the actions still sit highest/nearest the coil.

### 4.7 Writing field (the open page)
No box, no translucent fill — the sheet (card + grain) shows straight through.

```tsx
<div className="nb-paper relative min-h-0 overflow-hidden text-sm text-foreground/90">
  <RealtimeAudioRecorder … />
  <EditorContent editor={editor} className={isSavingNote || afterProcessing ? 'opacity-65' : ''} />
</div>
```
Keep `overflow-hidden` (scroll + recorder containment) and `text-sm` (the writing size). `.tiptap`
supplies its own `1rem` padding, so text already sits in from the edge like a page margin.

### 4.8 Voice recorder → outline
In `NoteEditor.tsx` the recorder is currently forced to a **filled** look via `variant="default"`
(it overrides the component's own `variant="outline"`). Drop that prop (or pass `variant="outline"`)
so it renders as a bordered control. *Optional:* `rounded-full` for a classic mic key.

```tsx
<RealtimeAudioRecorder
  onStreamingText={handleStreamingText}
  onFinalText={handleFinalText}
  className="absolute bottom-4 right-4 size-11 rounded-full z-20"
/>   {/* no variant prop → component's outline applies */}
```

---

## 5. Button treatments — the "all of them" pass

| Button | Variant | Key classes | Why |
| --- | --- | --- | --- |
| **Save / Update** | `default` (ink) → `destructive` on error | `size` default; *opt.* `shadow-sm hover:shadow-md active:translate-y-px active:shadow-none` | the one filled commit action |
| **Close (✕)** | `ghost` | `size="icon"` | quiet, dismissive |
| **AI title fill (✨)** | `outline` | `size="icon-sm"`, `hover:text-primary` | defined secondary control |
| **Voice recorder (🎙)** | `outline` | `size-11 rounded-full` | your "outline at least" ask |
| **Format toggles** | `Toggle` | inked active (`data-[state=on]:bg-primary/10 text-primary`) | active state in ink, not grey |

"All of them" → the **AI fill, recorder, and format toggles** all get defined (outline/inked)
treatment. **Save stays the single filled ink primary** so the commit action still reads as primary.
If you'd rather have *zero* filled buttons (pure stationery look), make Save an `outline` with
`text-primary border-primary/40` instead — just know it weakens the primary hierarchy a little.

---

## 6. Files to touch

- `frontend/src/components/Notes/NoteEditor.tsx` — grid + `lg:pt-20`, the tray, title row, divider,
  actions placement (4.6), open writing field, recorder variant. **(you're driving this one)**
- `frontend/src/components/Notes/NoteToolbar.tsx` — inked toggles, no own box (§4.5).
- *Optional:* `NoteTitleInput.tsx` (extract title), `Common/Toolbar/*` (extract inked rail).
- **No CSS changes needed** — `.nb-panel-quiet`, `.nb-paper`, `--border`, `--primary` already exist.

---

## 7. Open decisions (resolve while implementing)

1. **Actions placement:** A (in tray, recommended) vs B (separate header).
2. **Save style:** plain ink (default) · stamped (hard shadow + press) · outline (all-stationery).
3. **Recorder shape:** `rounded-full` (mic key) vs `rounded-lg`.
4. **Extraction:** keep inline vs pull out `NoteTitleInput` / shared `Toolbar`.

---

## 8. Verify

```bash
cd frontend
bunx tsc --noEmit -p tsconfig.app.json   # NOT tsc -b (pollutes source)
bun run lint
```

> There are **2 pre-existing** `TS6133` warnings in `NoteEditor.tsx` (`setIsTranscribing`,
> `handleTranscriptUpdate` — unwired transcription dead code). They're unrelated to this work;
> don't let them mask a *new* error you introduce.

Manual: open a note at `/notes` (Clerk-gated — use an authed browser or `DEV_AUTH_BYPASS`). Check
light **and** dark, and mobile full-screen vs the `lg` floating sheet (coil clearance).

---

## 9. Guardrails / don'ts

- **No translucent control fills** (`bg-*/40`). Controls use `.nb-panel-quiet`; the page uses `.nb-paper`.
- **Don't re-add ruled writing lines or a margin rule** — paper is intentionally line-less. Divider
  rules between sections are fine (that's what you liked); ruling across the writing area is not.
- **One ink + one highlighter.** Don't introduce new accent colors for buttons/toggles.
- **Keep** the hidden `DialogTitle` (Radix a11y) and the recorder's streaming/focus wiring.
